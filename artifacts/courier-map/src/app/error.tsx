"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ padding: 24, color: "#e63946", fontFamily: "monospace", fontSize: 13, background: "#0d1117", minHeight: "100vh" }}>
      <h2 style={{ color: "#ff8b9c" }}>Ошибка приложения</h2>
      <pre style={{ whiteSpace: "pre-wrap", color: "#ffadad" }}>{String(error?.message ?? error)}</pre>
      {error?.stack && (
        <pre style={{ whiteSpace: "pre-wrap", color: "#9ca3af", marginTop: 12, fontSize: 11 }}>{error.stack}</pre>
      )}
      <button
        onClick={reset}
        style={{ marginTop: 16, padding: "8px 14px", background: "#1f6feb", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
      >
        Повторить
      </button>
    </div>
  );
}
