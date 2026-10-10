import { getCurrentUser } from '@/lib/auth/session';

export default async function Identity() {
    const user = await getCurrentUser();
    if (!user) {
        return (
            <a
                className="bg-foreground text-background flex w-full cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2 text-sm transition-colors hover:bg-[#484848]"
                href="/auth/login"
            >
                Sign in
            </a>
        );
    }

    return (
        <div className="flex flex-col gap-3 text-sm">
            <div>
                Signed in as <span className="font-medium text-red-700">{user.sub}</span>
            </div>

            <div className="mx-auto flex">
                <form method="post" action="/auth/logout">
                    <button
                        type="submit"
                        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-black/8 px-4 py-2 whitespace-nowrap transition-colors hover:border-transparent hover:bg-black/4"
                    >
                        Log out
                    </button>
                </form>
            </div>
        </div>
    );
}
