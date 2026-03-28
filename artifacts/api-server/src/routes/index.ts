import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import contentRouter from "./content.js";
import subscriptionsRouter from "./subscriptions.js";
import paymentsRouter from "./payments.js";
import stripePaymentsRouter from "./stripe-payments.js";
import messagesRouter from "./messages.js";
import creatorRouter from "./creator.js";
import livestreamRouter from "./livestream.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/", contentRouter);
router.use("/subscriptions", subscriptionsRouter);
router.use("/payments", paymentsRouter);
router.use("/payments/stripe", stripePaymentsRouter);
router.use("/stripe", stripePaymentsRouter);
router.use("/tips", paymentsRouter);
router.use("/messages", messagesRouter);
router.use("/creator", creatorRouter);
router.use("/livestream", livestreamRouter);

export default router;
