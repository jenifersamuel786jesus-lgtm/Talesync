import jwt from "jsonwebtoken";

export default function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();

  try {
    const token = header.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
  } catch {
    // Optional auth should never block request processing.
  }

  return next();
}
