import Identity from '@/components/identity';

export default function Home() {
    return (
        <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 p-16 font-sans">
            <div className="flex">
                <Identity />
            </div>
        </div>
    );
}
