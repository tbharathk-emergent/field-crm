import React, { Suspense, lazy } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AppProvider } from "@/context/AppContext";
import { RequireAuth, TenantScope } from "@/components/Guards";
import AdminShell from "@/components/Layout/AdminShell";
import MobileShell from "@/components/Layout/MobileShell";
import MobileAdminShell from "@/components/Layout/MobileAdminShell";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

// Super Admin
import SuperDashboard from "@/pages/SuperAdmin/Dashboard";
import SuperTenants from "@/pages/SuperAdmin/Tenants";
import SuperPlans from "@/pages/SuperAdmin/Plans";
import SuperSettings from "@/pages/SuperAdmin/Settings";

// Tenant Admin
import AdminDashboard from "@/pages/TenantAdmin/Dashboard";
import AdminBranding from "@/pages/TenantAdmin/Branding";
import AdminEmployees from "@/pages/TenantAdmin/Employees";
import AdminDealers from "@/pages/TenantAdmin/Dealers";
import AdminProducts from "@/pages/TenantAdmin/Products";
import AdminOrders from "@/pages/TenantAdmin/Orders";
import AdminEnquiries from "@/pages/TenantAdmin/Enquiries";
import AdminReports from "@/pages/TenantAdmin/Reports";
import AdminAnnouncements from "@/pages/TenantAdmin/Announcements";
import AdminAreas from "@/pages/TenantAdmin/Areas";
import AdminRoles from "@/pages/TenantAdmin/Roles";
import AdminTargets from "@/pages/TenantAdmin/Targets";
import AdminLeaves from "@/pages/TenantAdmin/Leaves";

// Manager
import ManagerDashboard from "@/pages/Manager/Dashboard";
import ManagerTeam from "@/pages/Manager/Team";
import ManagerMap from "@/pages/Manager/MapView";
import ManagerReports from "@/pages/Manager/Reports";

// Employee PWA
import EmpHome from "@/pages/Employee/Home";
import EmpDealers from "@/pages/Employee/Dealers";
import EmpVisit from "@/pages/Employee/Visit";
import EmpCollection from "@/pages/Employee/Collection";
import EmpSales from "@/pages/Employee/Sales";
import EmpDCR from "@/pages/Employee/DCR";
import EmpEnquiry from "@/pages/Employee/Enquiry";
import EmpCatalogue from "@/pages/Employee/Catalogue";
import EmpNotifications from "@/pages/Employee/Notifications";
import EmpProfile from "@/pages/Employee/Profile";
import EmpLeaves from "@/pages/Employee/Leaves";

// Customer PWA
import CustHome from "@/pages/Customer/Home";
import CustCatalogue from "@/pages/Customer/Catalogue";
import CustCart from "@/pages/Customer/Cart";
import CustOrders from "@/pages/Customer/Orders";
import CustAccount from "@/pages/Customer/Account";

function App() {
  return (
    <AppProvider>
      <Toaster position="top-right" richColors closeButton />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/t/:slug" element={<TenantScope><Login /></TenantScope>} />

          {/* Super Admin */}
          <Route
            path="/super-admin"
            element={<RequireAuth roles={["super_admin"]}><AdminShell role="super_admin" /></RequireAuth>}
          >
            <Route index element={<SuperDashboard />} />
            <Route path="tenants" element={<SuperTenants />} />
            <Route path="plans" element={<SuperPlans />} />
            <Route path="settings" element={<SuperSettings />} />
          </Route>

          {/* Tenant Admin */}
          <Route
            path="/t/:slug/admin"
            element={
              <TenantScope>
                <RequireAuth roles={["tenant_admin"]}>
                  <MobileAdminShell role="tenant_admin" />
                </RequireAuth>
              </TenantScope>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="branding" element={<AdminBranding />} />
            <Route path="employees" element={<AdminEmployees />} />
            <Route path="dealers" element={<AdminDealers />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="enquiries" element={<AdminEnquiries />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="announcements" element={<AdminAnnouncements />} />
            <Route path="areas" element={<AdminAreas />} />
            <Route path="roles" element={<AdminRoles />} />
            <Route path="targets" element={<AdminTargets />} />
            <Route path="leaves" element={<AdminLeaves />} />
          </Route>

          {/* Manager */}
          <Route
            path="/t/:slug/manager"
            element={
              <TenantScope>
                <RequireAuth roles={["manager"]}>
                  <MobileAdminShell role="manager" />
                </RequireAuth>
              </TenantScope>
            }
          >
            <Route index element={<ManagerDashboard />} />
            <Route path="team" element={<ManagerTeam />} />
            <Route path="map" element={<ManagerMap />} />
            <Route path="reports" element={<ManagerReports />} />
            <Route path="targets" element={<AdminTargets />} />
            <Route path="leaves" element={<AdminLeaves />} />
          </Route>

          {/* Employee PWA */}
          <Route
            path="/t/:slug/app"
            element={
              <TenantScope>
                <RequireAuth roles={["employee", "manager", "tenant_admin"]}>
                  <MobileShell variant="employee" />
                </RequireAuth>
              </TenantScope>
            }
          >
            <Route index element={<EmpHome />} />
            <Route path="dealers" element={<EmpDealers />} />
            <Route path="visit" element={<EmpVisit />} />
            <Route path="collection" element={<EmpCollection />} />
            <Route path="sales" element={<EmpSales />} />
            <Route path="dcr" element={<EmpDCR />} />
            <Route path="enquiry" element={<EmpEnquiry />} />
            <Route path="catalogue" element={<EmpCatalogue />} />
            <Route path="notifications" element={<EmpNotifications />} />
            <Route path="profile" element={<EmpProfile />} />
            <Route path="leaves" element={<EmpLeaves />} />
          </Route>

          {/* Customer PWA */}
          <Route
            path="/t/:slug/shop"
            element={
              <TenantScope>
                <RequireAuth roles={["customer"]}>
                  <MobileShell variant="customer" />
                </RequireAuth>
              </TenantScope>
            }
          >
            <Route index element={<CustHome />} />
            <Route path="catalogue" element={<CustCatalogue />} />
            <Route path="cart" element={<CustCart />} />
            <Route path="orders" element={<CustOrders />} />
            <Route path="account" element={<CustAccount />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
