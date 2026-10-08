export default function Home() {
    return (
        <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans">
            <main className="flex w-full max-w-3xl flex-1 flex-col items-center justify-between bg-white px-16 py-32 sm:items-start">
                <div className="mx-auto flex flex-col gap-4 text-base font-medium sm:flex-row">
                    <a
                        className="bg-foreground text-background flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full px-5 transition-colors hover:bg-[#383838]"
                        href="/auth/login"
                    >
                        Sign in
                    </a>
                </div>
            </main>
        </div>
    );
}
