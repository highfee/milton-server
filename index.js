import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { corsMiddleware } from "./middleware/cors.js";
import authRoutes from "./routes/auth.js";
import entityRoutes from "./routes/entities.js";
import sendVerificationEmailRoute from "./routes/functions/sendVerificationEmail.js";
import sendAdmissionOfferEmailRoute from "./routes/functions/sendAdmissionOfferEmail.js";
import handleAdmissionResponseRoute from "./routes/functions/handleAdmissionResponse.js";
import logsRoute from "./routes/logs.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(corsMiddleware);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Static file uploads serving
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/entities", entityRoutes);
app.use("/api/functions/sendVerificationEmail", sendVerificationEmailRoute);
app.use("/api/functions/sendAdmissionOfferEmail", sendAdmissionOfferEmailRoute);
app.use("/api/functions/handleAdmissionResponse", handleAdmissionResponseRoute);
app.use("/api/logs", logsRoute);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404 handler for API routes
app.use("/api/*", (req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

app.listen(PORT, () => {
  console.log(
    `🚀 Milton College Portal Backend running on http://localhost:${PORT}`,
  );
});

export default app;
