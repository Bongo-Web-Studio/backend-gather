// src/routes/authRoutes.ts
import { Router } from "express";
import { signup, login, logout, getMe } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.Middleware";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", authenticate, getMe);

export default router;



// src/routes/authRoute.ts
import { Router } from "express";
import { AuthController } from "../controllers/authController";

const router = Router();

router.post("/signup", AuthController.signup);
router.post("/login", AuthController.login);
router.get("/me", AuthController.me);

export default router;
