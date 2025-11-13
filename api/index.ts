import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../server/app";
import type { Express } from "express";

let cachedApp: Promise<Express> | undefined;

async function getApp(): Promise<Express> {
  if (!cachedApp) {
    cachedApp = createApp();
  }

  return cachedApp;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const app = await getApp();
  app(req, res);
}

