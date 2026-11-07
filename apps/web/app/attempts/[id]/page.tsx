import { ResultScreen } from "../../../components/result-screen.tsx";
import { decodeRouteId } from "../../../lib/route-id.ts";

// Step 3. The id comes from the address; the page reads the attempt from the API.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResultScreen attemptId={decodeRouteId(id)} />;
}
