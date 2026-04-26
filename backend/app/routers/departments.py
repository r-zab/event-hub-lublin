"""
Router: Departments — słownik działów organizacyjnych.

GET (publiczny) zwraca listę aktywnych działów do dropdownów.
POST/PATCH/DELETE wymagają roli admin.
Usunięcie blokowane gdy istnieją użytkownicy przypisani do działu.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_admin, get_db
from app.models.department import Department
from app.models.user import User
from app.schemas.department import DepartmentCreate, DepartmentResponse, DepartmentUpdate

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("", response_model=list[DepartmentResponse], summary="Lista działów")
async def list_departments(
    only_active: bool = True,
    db: AsyncSession = Depends(get_db),
) -> list[DepartmentResponse]:
    """Zwróć działy (domyślnie tylko aktywne). Endpoint publiczny."""
    stmt = select(Department)
    if only_active:
        stmt = stmt.where(Department.is_active.is_(True))
    stmt = stmt.order_by(Department.code)
    result = await db.execute(stmt)
    return [DepartmentResponse.model_validate(d) for d in result.scalars().all()]


@router.post(
    "",
    response_model=DepartmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Dodaj dział (admin)",
)
async def create_department(
    body: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> DepartmentResponse:
    existing = await db.execute(select(Department).where(Department.code == body.code))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Dział o kodzie '{body.code}' już istnieje.",
        )
    dept = Department(code=body.code, name=body.name, is_active=body.is_active)
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    logger.info("Admin id=%d utworzył dział %r", current_admin.id, dept.code)
    return DepartmentResponse.model_validate(dept)


@router.patch(
    "/{dept_id}",
    response_model=DepartmentResponse,
    summary="Aktualizuj dział (admin)",
)
async def update_department(
    dept_id: int,
    body: DepartmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> DepartmentResponse:
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if dept is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dział nie istnieje.")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(dept, field, value)
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    logger.info("Admin id=%d zaktualizował dział id=%d (%s)", current_admin.id, dept.id, dept.code)
    return DepartmentResponse.model_validate(dept)


@router.delete(
    "/{dept_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Usuń dział (admin)",
)
async def delete_department(
    dept_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> None:
    """Usuń dział. Blokowane gdy istnieją użytkownicy przypisani do tego działu."""
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if dept is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dział nie istnieje.")

    user_count_result = await db.execute(
        select(func.count()).select_from(User).where(User.department == dept.code)
    )
    user_count: int = user_count_result.scalar_one()
    if user_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nie można usunąć — {user_count} użytkownik(ów) jest przypisanych do tego działu. Dezaktywuj zamiast usuwać.",
        )

    await db.delete(dept)
    await db.commit()
    logger.info("Admin id=%d usunął dział id=%d (%s)", current_admin.id, dept_id, dept.code)
