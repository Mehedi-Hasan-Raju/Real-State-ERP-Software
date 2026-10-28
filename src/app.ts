import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import authRoutes from "./modules/auth/auth.routes";
import { requireAuth } from "./middleware/auth.middleware";
import { allowRoles } from "./middleware/authorize.middleware";
import employeesRoutes from "./modules/employees/employees.routes";
import projectsRoutes from "./modules/projects/projects.routes";
import buildingsRoutes from "./modules/buildings/buildings.routes";
import floorsRoutes from "./modules/floors/floors.routes";
import unitsRoutes from "./modules/units/units.routes";
import customersRoutes from "./modules/customers/customers.routes";
import bookingsRoutes from "./modules/bookings/bookings.routes";
import installmentsRoutes from "./modules/installments/installments.routes";
import paymentsRoutes from "./modules/payments/payments.routes";
import financeReportsRoutes from "./modules/finance-reports/finance-reports.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import notificationsRoutes from "./modules/notifications/notifications.routes";


const app = express();

app.disable("x-powered-by");

app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/employees", employeesRoutes);
app.use("/api/v1/projects", projectsRoutes);
app.use("/api/v1/buildings", buildingsRoutes);
app.use("/api/v1/floors", floorsRoutes);
app.use("/api/v1/units", unitsRoutes);
app.use("/api/v1/customers", customersRoutes);
app.use("/api/v1/bookings", bookingsRoutes);
app.use("/api/v1/installments", installmentsRoutes);
app.use("/api/v1/payments", paymentsRoutes);
app.use("/api/v1/finance-reports", financeReportsRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/notifications", notificationsRoutes);


app.get("/api/v1/private", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get(
  "/api/v1/admin-check",
  requireAuth,
  allowRoles("OWNER", "ADMIN"),
  (_req, res) => {
    res.json({ message: "Authorized" });
  },
);

export default app;
