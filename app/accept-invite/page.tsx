import AcceptForm from "@/components/AcceptForm";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <AcceptForm token={token ?? ""} />;
}
