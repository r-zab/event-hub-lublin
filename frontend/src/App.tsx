import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";

import { PublicLayout } from "@/components/PublicLayout";
import { ProtectedAdminLayout } from "@/components/ProtectedAdminLayout";

import Index from "./pages/Index";
import Register from "./pages/Register";
import Unsubscribe from "./pages/Unsubscribe";
import About from "./pages/About";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminEventForm from "./pages/AdminEventForm";
import AdminSubscribers from "./pages/AdminSubscribers";
import AdminNotifications from "./pages/AdminNotifications";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Index />} />
              <Route path="/register" element={<Register />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />
              <Route path="/about" element={<About />} />
            </Route>

            {/* Admin auth */}
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* Admin panel — protected */}
            <Route element={<ProtectedAdminLayout />}>
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/events/new" element={<AdminEventForm />} />
              <Route path="/admin/events/edit/:id" element={<AdminEventForm />} />
              <Route path="/admin/subscribers" element={<AdminSubscribers />} />
              <Route path="/admin/notifications" element={<AdminNotifications />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
