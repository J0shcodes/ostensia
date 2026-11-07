import { ProposalScreen } from "../../../components/proposal-screen.tsx";
import { decodeRouteId } from "../../../lib/route-id.ts";

// Step 2. The id comes from the address; the page reads the mandate from the API.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProposalScreen mandateId={decodeRouteId(id)} />;
}
