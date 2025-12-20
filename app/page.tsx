import ThreadedChat from "./ui/ThreadedChat";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-950 dark:bg-black dark:text-zinc-50">
      <ThreadedChat />
    </div>
  );
}
