import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface DepartmentItem {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

export function useDepartments(onlyActive = true) {
  const { data, isLoading } = useQuery<DepartmentItem[]>({
    queryKey: ['departments', onlyActive],
    queryFn: () => apiFetch<DepartmentItem[]>(`/departments?only_active=${onlyActive}`),
    staleTime: 5 * 60 * 1000,
  });
  return { departments: data ?? [], isLoading };
}
