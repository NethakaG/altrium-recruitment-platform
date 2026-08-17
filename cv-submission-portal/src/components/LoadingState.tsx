export function LoadingState() {
  return (
    <div className="position-loading" aria-live="polite">
      <span className="spinner spinner-dark" aria-hidden="true" />
      <span>Loading available positions…</span>
    </div>
  )
}
