import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders plant scanner heading", () => {
  render(<App />);
  expect(screen.getByText(/I-scan ang Puno o Halaman/i)).toBeInTheDocument();
});
