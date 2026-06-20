import React from "react";
import { Link } from "react-router-dom";
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-brand-bg">
      <div className="font-display text-6xl font-bold text-brand-primary">404</div>
      <p className="text-brand-mute mt-2">Page not found</p>
      <Link to="/" className="btn-primary mt-6">Back home</Link>
    </div>
  );
}
