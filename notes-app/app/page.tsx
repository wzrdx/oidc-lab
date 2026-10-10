export default function Home() {
    return (
        <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans">
            <main className="flex w-full max-w-3xl flex-1 flex-col items-center justify-between px-16 py-32 sm:items-start">
                <div className="mx-auto flex flex-row gap-3 text-sm font-medium">
                    <a
                        className="bg-foreground text-background flex w-full cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2 transition-colors hover:bg-[#484848]"
                        href="/auth/login"
                    >
                        Sign in
                    </a>

                    {/* A form, not a link: logout must be a POST (see app/auth/logout/route.ts). */}
                    <form method="post" action="/auth/logout">
                        <div className="flex">
                            <button
                                type="submit"
                                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-black/8 px-4 py-2 whitespace-nowrap transition-colors hover:border-transparent hover:bg-black/4"
                            >
                                Log out
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
}
