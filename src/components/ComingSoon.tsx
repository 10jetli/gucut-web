// หน้า placeholder สำหรับเฟสถัดไป
export default function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-2 px-6 text-center">
      <span className="text-4xl">🚧</span>
      <h1 className="font-heading text-xl font-bold text-safety">{title}</h1>
      <p className="text-sm text-steel-300">{note}</p>
    </main>
  );
}
