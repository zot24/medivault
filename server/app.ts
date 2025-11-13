import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { registerRoutes } from "./routes";

export async function createApp(): Promise<Express> {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    console.error(err);
  });

  return app;
}

