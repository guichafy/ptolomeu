import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

function App() {
	return (
		<div className="flex flex-col min-h-screen">
			<div className="border-b px-4 py-3">
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
					<Input
						type="text"
						placeholder="Buscar..."
						className="pl-10 h-11 text-base border-none shadow-none focus-visible:ring-0"
						autoFocus
					/>
				</div>
			</div>
			<div className="flex-1 flex items-center justify-center">
				<p className="text-sm text-muted-foreground">
					Digite para buscar
				</p>
			</div>
		</div>
	);
}

export default App;
