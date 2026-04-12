import { Separator } from "@/components/ui/separator";
import { CustomFiltersList } from "./custom-filters-list";
import { TokenField } from "./token-field";

export function GitHubSection() {
	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-1">
				<h2 className="text-lg font-semibold">GitHub</h2>
				<p className="text-xs text-muted-foreground/80">
					Token de acesso e filtros customizados de busca.
				</p>
			</div>
			<TokenField />
			<Separator className="opacity-40" />
			<CustomFiltersList />
		</div>
	);
}
