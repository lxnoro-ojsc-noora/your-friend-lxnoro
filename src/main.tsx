import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AlternativeResponsePage, PublicBookingPage } from "./components/BookingViews";
import "./styles.css";

const publicBooking = window.location.pathname.match(/^\/book\/([A-Za-z0-9_-]{32})\/?$/);
const alternative = window.location.pathname.match(/^\/alternative\/([A-Za-z0-9_-]{32})\/?$/);
const page = publicBooking ? <PublicBookingPage linkId={publicBooking[1]!} /> : alternative ? <AlternativeResponsePage responseKey={alternative[1]!} /> : <App />;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {page}
  </React.StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
