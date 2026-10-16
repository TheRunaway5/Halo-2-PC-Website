import Link from "next/link";
export default function NotFound() {
  return (
    <div className="page-width interior">
      <p className="eyebrow">404 / SIGNAL LOST</p>
      <h1>This coordinate is off the map.</h1>
      <p className="page-intro">Return to base and find your way from there.</p>
      <Link href="/" className="button primary">
        Back to the project →
      </Link>
    </div>
  );
}
