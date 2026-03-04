/**
 * Dashboard strip showing summary stats from all modules.
 * Displayed at the top of the widget.
 */
export class DailySummary {
	private el: HTMLElement;
	private cardsEl: HTMLElement;

	constructor(parent: HTMLElement) {
		this.el = parent.createDiv({ cls: 'pt-daily-summary' });
		this.cardsEl = this.el.createDiv({ cls: 'pt-summary-cards' });
	}

	/** Clear and re-render summary cards. */
	render(cards: SummaryCard[]): void {
		this.cardsEl.empty();
		for (const card of cards) {
			const cardEl = this.cardsEl.createDiv({ cls: 'pt-summary-card' });
			cardEl.createDiv({ cls: 'pt-summary-card-value', text: card.value });
			cardEl.createDiv({ cls: 'pt-summary-card-label', text: card.label });
			if (card.sublabel) {
				cardEl.createDiv({ cls: 'pt-summary-card-sublabel', text: card.sublabel });
			}
		}
	}

	getEl(): HTMLElement {
		return this.el;
	}
}

export interface SummaryCard {
	label: string;
	value: string;
	sublabel?: string;
}
