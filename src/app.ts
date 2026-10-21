
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import authRoutes from "./modules/auth/auth.routes";
import { requireAuth } from "./middleware/auth.middleware";
import { allowRoles } from "./middleware/authorize.middleware";
import employeesRoutes from "./modules/employees/employees.routes";
import projectsRoutes from "./modules/projects/projects.routes";


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
