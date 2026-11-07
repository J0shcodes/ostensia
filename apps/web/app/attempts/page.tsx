import { AttemptsList } from "../../components/attempts-list.tsx";

// Every purchase attempt the API knows about, newest first (guidelines section 13.5).
export default function Page() {
  return <AttemptsList />;
}
