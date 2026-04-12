import { Switch } from "@/components/ui/switch";
import { useSettings } from "./settings-context";

export function GeneralSection() {
	const { analyticsSettings, updateAnalyticsConsent } = useSettings();

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-1">
				<h2 className="text-lg font-semibold">Geral</h2>
				<p className="text-xs text-muted-foreground/80">
					Configurações gerais do aplicativo.
				</p>
			</div>

			<div className="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-card p-3">
				<div className="flex flex-col gap-0.5">
					<label htmlFor="analytics-consent" className="text-sm font-medium">
						Análise de uso
					</label>
					<span className="text-xs text-muted-foreground">
						Enviar dados anônimos para melhorar o app. Nenhuma informação
						pessoal é coletada.
					</span>
				</div>
				<Switch
					id="analytics-consent"
					checked={analyticsSettings.consentGiven}
					onCheckedChange={updateAnalyticsConsent}
				/>
			</div>
		</div>
	);
}
