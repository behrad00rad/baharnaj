import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { PublicLayout } from "./components/PublicLayout";
import Booking from "./pages/Booking";
import AdminLayout from "./components/AdminLayout";
import AdminRouter from "./pages/AdminApp";
import EmployeeLayout from "./components/EmployeeLayout";
import EmployeeApp from "./pages/EmployeeApp";
import Gallery from "./pages/Gallery";
import Home from "./pages/Home";
import Login from "./pages/Login";
import ServiceDetail from "./pages/ServiceDetail";
import Services from "./pages/Services";
import About from "./pages/About";
import Team from "./pages/Team";
import Contact from "./pages/Contact";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import "./App.css";
import { api, applyRefreshSession } from "./shared/api";
import { clearSessionState, markAuthReady, useAuth } from "./shared/auth";
import { ThemeProvider } from "./shared/theme";

let authBootstrapPromise;

// App is intentionally limited to routing; page behavior lives beside its page.
export default function App() {
  const { ready } = useAuth();
  useEffect(() => {
    authBootstrapPromise ??= api
      .post("auth/token/refresh/")
      .then(({ data }) => applyRefreshSession(data))
      .catch(() => clearSessionState())
      .finally(markAuthReady);
  }, []);
  if (!ready) return null;
  return (
    <ThemeProvider>
      <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <PublicLayout>
              <Home />
            </PublicLayout>
          }
        />
        <Route
          path="/services"
          element={
            <PublicLayout>
              <Services />
            </PublicLayout>
          }
        />
        <Route
          path="/services/:id"
          element={
            <PublicLayout>
              <ServiceDetail />
            </PublicLayout>
          }
        />
        <Route
          path="/gallery"
          element={
            <PublicLayout>
              <Gallery />
            </PublicLayout>
          }
        />
        <Route
          path="/book"
          element={
            <PublicLayout>
              <Booking />
            </PublicLayout>
          }
        />
        <Route
          path="/login"
          element={
            <PublicLayout>
              <Login />
            </PublicLayout>
          }
        />
        <Route
          path="/booking-confirmation"
          element={<Navigate to="/book" replace />}
        />
        <Route
          path="/about"
          element={
            <PublicLayout>
              <About />
            </PublicLayout>
          }
        />
        <Route
          path="/team"
          element={
            <PublicLayout>
              <Team />
            </PublicLayout>
          }
        />
        <Route
          path="/contact"
          element={
            <PublicLayout>
              <Contact />
            </PublicLayout>
          }
        />
        <Route
          path="/privacy"
          element={
            <PublicLayout>
              <Privacy />
            </PublicLayout>
          }
        />
        <Route
          path="/terms"
          element={
            <PublicLayout>
              <Terms />
            </PublicLayout>
          }
        />
        <Route path="/employee/*" element={<EmployeeLayout />}>
          <Route path="*" element={<EmployeeApp />} />
        </Route>
        <Route path="/admin/*" element={<AdminLayout />}>
          <Route path="*" element={<AdminRouter />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
