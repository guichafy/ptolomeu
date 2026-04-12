import { TokenField } from "./token-field";

export function GitHubSection() {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="text-lg font-semibold">GitHub</h2>
				<p className="text-xs text-muted-foreground">
					Token de acesso e filtros customizados de busca.
				</p>
			</div>
			<TokenField />
		</div>
	);
}
