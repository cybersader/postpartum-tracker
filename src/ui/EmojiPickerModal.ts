/**
 * Emoji picker modal with fuzzy search using Obsidian's FuzzySuggestModal.
 * Contains a curated set of ~250 emojis with keyword mappings for search.
 */

import { App, FuzzySuggestModal } from 'obsidian';
import type { FuzzyMatch } from 'obsidian';

export interface EmojiItem {
	emoji: string;
	name: string;
	keywords: string[];
}

/**
 * Curated emoji data with search keywords.
 * Organized by relevance to postpartum/baby tracking, then general use.
 */
export const EMOJI_DATA: EmojiItem[] = [
	// ── Baby & Family ────────────────────────────────────────
	{ emoji: '👶', name: 'Baby', keywords: ['infant', 'newborn', 'child'] },
	{ emoji: '🍼', name: 'Baby bottle', keywords: ['milk', 'formula', 'feeding', 'bottle'] },
	{ emoji: '🤱', name: 'Breastfeeding', keywords: ['nursing', 'feeding', 'breast', 'lactation'] },
	{ emoji: '👣', name: 'Footprints', keywords: ['baby', 'feet', 'steps', 'walking'] },
	{ emoji: '🧒', name: 'Child', keywords: ['kid', 'toddler'] },
	{ emoji: '👧', name: 'Girl', keywords: ['daughter', 'child'] },
	{ emoji: '👦', name: 'Boy', keywords: ['son', 'child'] },
	{ emoji: '👨‍👩‍👧', name: 'Family', keywords: ['parents', 'household'] },
	{ emoji: '🧸', name: 'Teddy bear', keywords: ['toy', 'stuffed', 'animal', 'comfort'] },
	{ emoji: '🎀', name: 'Ribbon', keywords: ['bow', 'decoration', 'girl'] },
	{ emoji: '💙', name: 'Blue heart', keywords: ['boy', 'love'] },
	{ emoji: '💗', name: 'Pink heart', keywords: ['girl', 'love', 'growing'] },
	{ emoji: '🧷', name: 'Safety pin', keywords: ['diaper', 'pin', 'baby'] },
	{ emoji: '🚼', name: 'Baby symbol', keywords: ['changing', 'nursery'] },
	{ emoji: '🛏️', name: 'Bed', keywords: ['sleep', 'crib', 'bassinet', 'cosleep'] },
	{ emoji: '🪜', name: 'Ladder', keywords: ['milestone', 'growth', 'progress'] },
	{ emoji: '🎂', name: 'Birthday cake', keywords: ['celebration', 'milestone', 'age'] },
	{ emoji: '🧒', name: 'Toddler', keywords: ['child', 'growing', 'development'] },

	// ── Health & Medical ─────────────────────────────────────
	{ emoji: '💊', name: 'Pill', keywords: ['medicine', 'medication', 'drug', 'tablet', 'capsule'] },
	{ emoji: '💉', name: 'Syringe', keywords: ['injection', 'shot', 'vaccine', 'needle'] },
	{ emoji: '🩹', name: 'Bandage', keywords: ['adhesive', 'wound', 'band-aid', 'healing'] },
	{ emoji: '🩺', name: 'Stethoscope', keywords: ['doctor', 'medical', 'checkup', 'heartbeat'] },
	{ emoji: '🌡️', name: 'Thermometer', keywords: ['temperature', 'fever', 'sick'] },
	{ emoji: '🏥', name: 'Hospital', keywords: ['medical', 'clinic', 'emergency'] },
	{ emoji: '⚕️', name: 'Medical symbol', keywords: ['health', 'caduceus', 'doctor'] },
	{ emoji: '🩸', name: 'Drop of blood', keywords: ['blood', 'bleeding', 'lochia', 'period'] },
	{ emoji: '🧬', name: 'DNA', keywords: ['genetics', 'science', 'biology'] },
	{ emoji: '🫀', name: 'Anatomical heart', keywords: ['heart', 'organ', 'cardiac'] },
	{ emoji: '🫁', name: 'Lungs', keywords: ['breathing', 'respiratory'] },
	{ emoji: '🧠', name: 'Brain', keywords: ['mental', 'head', 'circumference', 'cognitive'] },
	{ emoji: '🦷', name: 'Tooth', keywords: ['teeth', 'dental', 'teething'] },
	{ emoji: '👁️', name: 'Eye', keywords: ['vision', 'sight', 'jaundice', 'color'] },
	{ emoji: '👂', name: 'Ear', keywords: ['hearing', 'listen', 'screening'] },
	{ emoji: '🦶', name: 'Foot', keywords: ['feet', 'heel', 'prick', 'screening'] },
	{ emoji: '🤒', name: 'Face with thermometer', keywords: ['sick', 'fever', 'ill'] },
	{ emoji: '🤕', name: 'Face with bandage', keywords: ['hurt', 'injury', 'pain'] },
	{ emoji: '🤧', name: 'Sneezing face', keywords: ['cold', 'sick', 'allergy'] },
	{ emoji: '🤮', name: 'Vomiting', keywords: ['spit up', 'reflux', 'nausea', 'throw up'] },

	// ── Body Care & Recovery ─────────────────────────────────
	{ emoji: '🧴', name: 'Lotion bottle', keywords: ['cream', 'moisturizer', 'topical', 'ointment', 'spray'] },
	{ emoji: '🛁', name: 'Bathtub', keywords: ['bath', 'sitz', 'soak', 'wash'] },
	{ emoji: '🚿', name: 'Shower', keywords: ['wash', 'clean', 'peri', 'bottle', 'rinse'] },
	{ emoji: '🧊', name: 'Ice', keywords: ['cold', 'pack', 'compress', 'padsicle', 'frozen'] },
	{ emoji: '🔥', name: 'Fire', keywords: ['heat', 'warm', 'hot', 'compress', 'pad'] },
	{ emoji: '🧻', name: 'Toilet paper', keywords: ['tissue', 'wipe', 'bathroom'] },
	{ emoji: '🚽', name: 'Toilet', keywords: ['bathroom', 'restroom', 'bowel', 'movement'] },
	{ emoji: '🚻', name: 'Restroom', keywords: ['bathroom', 'toilet', 'urination'] },
	{ emoji: '🩲', name: 'Underwear', keywords: ['pad', 'diaper', 'perineal'] },
	{ emoji: '🧹', name: 'Broom', keywords: ['clean', 'tidy', 'sweep'] },
	{ emoji: '🪥', name: 'Toothbrush', keywords: ['hygiene', 'dental', 'care'] },
	{ emoji: '💆', name: 'Person getting massage', keywords: ['relax', 'massage', 'selfcare', 'spa'] },
	{ emoji: '🧘', name: 'Person meditating', keywords: ['yoga', 'meditation', 'calm', 'mindful'] },
	{ emoji: '🚶', name: 'Person walking', keywords: ['walk', 'exercise', 'activity', 'steps'] },
	{ emoji: '🏃', name: 'Person running', keywords: ['exercise', 'run', 'jog', 'activity'] },
	{ emoji: '🤸', name: 'Person cartwheeling', keywords: ['exercise', 'active', 'play'] },

	// ── Sleep & Rest ─────────────────────────────────────────
	{ emoji: '😴', name: 'Sleeping face', keywords: ['sleep', 'tired', 'rest', 'nap', 'zzz'] },
	{ emoji: '💤', name: 'Zzz', keywords: ['sleep', 'snoring', 'nap', 'rest'] },
	{ emoji: '🌙', name: 'Crescent moon', keywords: ['night', 'bedtime', 'sleep'] },
	{ emoji: '⭐', name: 'Star', keywords: ['night', 'twinkle', 'rating'] },
	{ emoji: '🌟', name: 'Glowing star', keywords: ['special', 'milestone', 'achievement'] },
	{ emoji: '☀️', name: 'Sun', keywords: ['morning', 'day', 'wake', 'vitamin d'] },
	{ emoji: '🌅', name: 'Sunrise', keywords: ['morning', 'wake', 'dawn'] },
	{ emoji: '🌆', name: 'Cityscape at dusk', keywords: ['evening', 'sunset', 'night'] },

	// ── Diapers & Bodily Functions ───────────────────────────
	{ emoji: '🧷', name: 'Diaper pin', keywords: ['diaper', 'nappy', 'change'] },
	{ emoji: '💩', name: 'Poop', keywords: ['dirty', 'diaper', 'stool', 'bowel', 'movement'] },
	{ emoji: '💧', name: 'Droplet', keywords: ['wet', 'water', 'pee', 'urine', 'hydration'] },
	{ emoji: '🫧', name: 'Bubbles', keywords: ['bath', 'clean', 'wash', 'gas'] },
	{ emoji: '💨', name: 'Wind', keywords: ['gas', 'burp', 'fart', 'toot'] },
	{ emoji: '😮', name: 'Open mouth', keywords: ['hiccup', 'surprise', 'gasp', 'yawn'] },
	{ emoji: '🤢', name: 'Nauseated face', keywords: ['sick', 'nausea', 'queasy'] },

	// ── Food & Drink ─────────────────────────────────────────
	{ emoji: '🥛', name: 'Glass of milk', keywords: ['milk', 'dairy', 'drink'] },
	{ emoji: '🧃', name: 'Juice box', keywords: ['juice', 'drink', 'beverage'] },
	{ emoji: '🍵', name: 'Tea', keywords: ['drink', 'warm', 'herbal', 'cup'] },
	{ emoji: '☕', name: 'Coffee', keywords: ['caffeine', 'drink', 'morning'] },
	{ emoji: '🍎', name: 'Red apple', keywords: ['fruit', 'food', 'healthy', 'snack'] },
	{ emoji: '🍌', name: 'Banana', keywords: ['fruit', 'food', 'potassium', 'snack'] },
	{ emoji: '🥑', name: 'Avocado', keywords: ['food', 'healthy', 'fat'] },
	{ emoji: '🥣', name: 'Bowl with spoon', keywords: ['cereal', 'soup', 'food', 'porridge'] },
	{ emoji: '🍽️', name: 'Plate with cutlery', keywords: ['meal', 'food', 'dinner', 'eat'] },
	{ emoji: '🥤', name: 'Cup with straw', keywords: ['drink', 'beverage', 'smoothie'] },
	{ emoji: '🫗', name: 'Pouring liquid', keywords: ['pour', 'milk', 'water', 'measure'] },
	{ emoji: '🍯', name: 'Honey pot', keywords: ['sweet', 'honey', 'natural'] },

	// ── Faces & Emotions ─────────────────────────────────────
	{ emoji: '😊', name: 'Smiling face', keywords: ['happy', 'glad', 'content', 'smile'] },
	{ emoji: '😌', name: 'Relieved face', keywords: ['calm', 'peaceful', 'relaxed'] },
	{ emoji: '😢', name: 'Crying face', keywords: ['sad', 'tear', 'upset'] },
	{ emoji: '😭', name: 'Loudly crying', keywords: ['sobbing', 'very sad', 'overwhelmed'] },
	{ emoji: '😤', name: 'Huffing face', keywords: ['frustrated', 'angry', 'annoyed'] },
	{ emoji: '😰', name: 'Anxious face', keywords: ['anxious', 'worried', 'nervous', 'stress'] },
	{ emoji: '🥱', name: 'Yawning face', keywords: ['tired', 'sleepy', 'bored', 'exhausted'] },
	{ emoji: '😵', name: 'Dizzy face', keywords: ['dizzy', 'overwhelmed', 'confused'] },
	{ emoji: '🥰', name: 'Smiling with hearts', keywords: ['love', 'adore', 'affection', 'grateful'] },
	{ emoji: '😇', name: 'Smiling with halo', keywords: ['angel', 'innocent', 'blessed', 'grateful'] },
	{ emoji: '😡', name: 'Angry face', keywords: ['angry', 'mad', 'rage'] },
	{ emoji: '😔', name: 'Pensive face', keywords: ['sad', 'reflective', 'down', 'depressed'] },
	{ emoji: '🫠', name: 'Melting face', keywords: ['overwhelmed', 'exhausted', 'done'] },
	{ emoji: '😵‍💫', name: 'Face with spiral eyes', keywords: ['dizzy', 'disoriented', 'overwhelmed'] },
	{ emoji: '🤯', name: 'Exploding head', keywords: ['mind blown', 'shocked', 'overwhelmed'] },
	{ emoji: '😅', name: 'Grinning with sweat', keywords: ['nervous', 'relieved', 'phew'] },
	{ emoji: '🥲', name: 'Smiling with tear', keywords: ['happy sad', 'bittersweet', 'touched'] },

	// ── Hands & Gestures ─────────────────────────────────────
	{ emoji: '🤲', name: 'Palms up', keywords: ['open', 'receive', 'hold', 'skin to skin'] },
	{ emoji: '🤝', name: 'Handshake', keywords: ['support', 'help', 'partner'] },
	{ emoji: '👍', name: 'Thumbs up', keywords: ['good', 'ok', 'approve', 'yes'] },
	{ emoji: '👎', name: 'Thumbs down', keywords: ['bad', 'no', 'disapprove'] },
	{ emoji: '👏', name: 'Clapping hands', keywords: ['applause', 'congratulations', 'bravo'] },
	{ emoji: '🙏', name: 'Folded hands', keywords: ['pray', 'please', 'thank', 'hope', 'grateful'] },
	{ emoji: '💪', name: 'Flexed bicep', keywords: ['strong', 'strength', 'power', 'exercise'] },
	{ emoji: '🤞', name: 'Crossed fingers', keywords: ['luck', 'hope', 'wish'] },
	{ emoji: '✋', name: 'Raised hand', keywords: ['stop', 'wait', 'high five'] },
	{ emoji: '👋', name: 'Waving hand', keywords: ['hello', 'goodbye', 'wave'] },

	// ── Hearts & Love ────────────────────────────────────────
	{ emoji: '❤️', name: 'Red heart', keywords: ['love', 'heart', 'romance'] },
	{ emoji: '🧡', name: 'Orange heart', keywords: ['love', 'warm'] },
	{ emoji: '💛', name: 'Yellow heart', keywords: ['love', 'friendship', 'happy'] },
	{ emoji: '💚', name: 'Green heart', keywords: ['love', 'healthy', 'nature'] },
	{ emoji: '💜', name: 'Purple heart', keywords: ['love', 'compassion'] },
	{ emoji: '🖤', name: 'Black heart', keywords: ['love', 'dark', 'grief'] },
	{ emoji: '🤍', name: 'White heart', keywords: ['love', 'pure', 'clean'] },
	{ emoji: '💕', name: 'Two hearts', keywords: ['love', 'affection', 'pair'] },
	{ emoji: '💝', name: 'Heart with ribbon', keywords: ['gift', 'love', 'present'] },

	// ── Objects & Tools ──────────────────────────────────────
	{ emoji: '⏰', name: 'Alarm clock', keywords: ['time', 'timer', 'reminder', 'schedule'] },
	{ emoji: '🕐', name: 'Clock', keywords: ['time', 'hour', 'schedule'] },
	{ emoji: '⏱️', name: 'Stopwatch', keywords: ['timer', 'duration', 'timing'] },
	{ emoji: '📝', name: 'Memo', keywords: ['note', 'write', 'journal', 'log'] },
	{ emoji: '📋', name: 'Clipboard', keywords: ['list', 'checklist', 'todo', 'tasks'] },
	{ emoji: '📊', name: 'Bar chart', keywords: ['chart', 'graph', 'statistics', 'data'] },
	{ emoji: '📈', name: 'Chart increasing', keywords: ['growth', 'progress', 'up', 'gain'] },
	{ emoji: '📉', name: 'Chart decreasing', keywords: ['decline', 'down', 'decrease'] },
	{ emoji: '📅', name: 'Calendar', keywords: ['date', 'schedule', 'day', 'plan'] },
	{ emoji: '🔔', name: 'Bell', keywords: ['notification', 'alert', 'reminder', 'alarm'] },
	{ emoji: '🔕', name: 'Bell with slash', keywords: ['mute', 'silent', 'no notification'] },
	{ emoji: '📱', name: 'Mobile phone', keywords: ['phone', 'device', 'app'] },
	{ emoji: '💡', name: 'Light bulb', keywords: ['idea', 'tip', 'insight', 'bright'] },
	{ emoji: '🔑', name: 'Key', keywords: ['important', 'unlock', 'access'] },
	{ emoji: '🏷️', name: 'Label', keywords: ['tag', 'name', 'category'] },
	{ emoji: '📌', name: 'Pushpin', keywords: ['pin', 'important', 'location', 'mark'] },
	{ emoji: '📎', name: 'Paperclip', keywords: ['attach', 'link', 'connect'] },
	{ emoji: '✂️', name: 'Scissors', keywords: ['cut', 'cord', 'umbilical'] },
	{ emoji: '🪡', name: 'Sewing needle', keywords: ['stitch', 'suture', 'repair'] },
	{ emoji: '⚖️', name: 'Balance scale', keywords: ['weight', 'measure', 'compare', 'scale'] },
	{ emoji: '📏', name: 'Ruler', keywords: ['measure', 'length', 'height', 'size'] },
	{ emoji: '🎵', name: 'Musical notes', keywords: ['music', 'lullaby', 'song', 'sound'] },
	{ emoji: '📖', name: 'Open book', keywords: ['reading', 'story', 'book'] },

	// ── Nature & Weather ─────────────────────────────────────
	{ emoji: '🌸', name: 'Cherry blossom', keywords: ['flower', 'spring', 'pink', 'bloom'] },
	{ emoji: '🌼', name: 'Blossom', keywords: ['flower', 'bloom', 'yellow'] },
	{ emoji: '🌿', name: 'Herb', keywords: ['plant', 'natural', 'herbal', 'green'] },
	{ emoji: '🍃', name: 'Leaf fluttering', keywords: ['nature', 'wind', 'fresh', 'breeze'] },
	{ emoji: '🌈', name: 'Rainbow', keywords: ['hope', 'promise', 'rainbow baby', 'color'] },
	{ emoji: '☁️', name: 'Cloud', keywords: ['weather', 'cloudy', 'mood'] },
	{ emoji: '🌧️', name: 'Rain cloud', keywords: ['rain', 'crying', 'sad'] },
	{ emoji: '❄️', name: 'Snowflake', keywords: ['cold', 'ice', 'winter', 'frozen'] },

	// ── Symbols & Marks ──────────────────────────────────────
	{ emoji: '✅', name: 'Check mark', keywords: ['done', 'complete', 'yes', 'confirmed'] },
	{ emoji: '❌', name: 'Cross mark', keywords: ['no', 'wrong', 'cancel', 'delete'] },
	{ emoji: '⚠️', name: 'Warning', keywords: ['alert', 'caution', 'danger'] },
	{ emoji: '🚨', name: 'Rotating light', keywords: ['emergency', 'urgent', 'alert', 'siren'] },
	{ emoji: '❓', name: 'Question mark', keywords: ['question', 'unknown', 'help'] },
	{ emoji: '❗', name: 'Exclamation', keywords: ['important', 'urgent', 'attention'] },
	{ emoji: '➕', name: 'Plus', keywords: ['add', 'more', 'increase', 'new'] },
	{ emoji: '➖', name: 'Minus', keywords: ['subtract', 'less', 'decrease'] },
	{ emoji: '🔄', name: 'Counterclockwise arrows', keywords: ['refresh', 'repeat', 'cycle', 'sync'] },
	{ emoji: '↗️', name: 'Arrow upper right', keywords: ['increase', 'up', 'growth', 'trend'] },
	{ emoji: '↘️', name: 'Arrow lower right', keywords: ['decrease', 'down', 'decline'] },
	{ emoji: '🔴', name: 'Red circle', keywords: ['stop', 'alert', 'urgent', 'red'] },
	{ emoji: '🟡', name: 'Yellow circle', keywords: ['warning', 'caution', 'yellow'] },
	{ emoji: '🟢', name: 'Green circle', keywords: ['go', 'ok', 'good', 'green', 'on track'] },
	{ emoji: '🔵', name: 'Blue circle', keywords: ['info', 'blue', 'neutral'] },
	{ emoji: '⭕', name: 'Hollow circle', keywords: ['empty', 'none', 'zero'] },
	{ emoji: '🏆', name: 'Trophy', keywords: ['achievement', 'milestone', 'win', 'goal'] },
	{ emoji: '🎯', name: 'Bullseye', keywords: ['target', 'goal', 'aim', 'exact'] },
	{ emoji: '🎉', name: 'Party popper', keywords: ['celebration', 'milestone', 'congratulations'] },

	// ── Animals ──────────────────────────────────────────────
	{ emoji: '🐣', name: 'Hatching chick', keywords: ['baby', 'new', 'birth', 'emerging'] },
	{ emoji: '🐥', name: 'Baby chick', keywords: ['little', 'cute', 'small'] },
	{ emoji: '🦋', name: 'Butterfly', keywords: ['change', 'growth', 'transformation', 'beautiful'] },
	{ emoji: '🐝', name: 'Bee', keywords: ['busy', 'honey', 'sting'] },
	{ emoji: '🐻', name: 'Bear', keywords: ['teddy', 'animal', 'strong'] },
	{ emoji: '🐰', name: 'Rabbit', keywords: ['bunny', 'cute', 'animal'] },
	{ emoji: '🦊', name: 'Fox', keywords: ['animal', 'clever', 'cute'] },
	{ emoji: '🐱', name: 'Cat face', keywords: ['cat', 'pet', 'animal'] },
	{ emoji: '🐶', name: 'Dog face', keywords: ['dog', 'pet', 'animal'] },

	// ── Transport & Places ───────────────────────────────────
	{ emoji: '🏠', name: 'House', keywords: ['home', 'family'] },
	{ emoji: '🚗', name: 'Car', keywords: ['drive', 'travel', 'car seat'] },
	{ emoji: '🛒', name: 'Shopping cart', keywords: ['store', 'shopping', 'supplies'] },
	{ emoji: '🌡️', name: 'Thermometer', keywords: ['temperature', 'weather', 'fever'] },
];

export class EmojiPickerModal extends FuzzySuggestModal<EmojiItem> {
	private onChoose: (emoji: string) => void;

	constructor(app: App, onChoose: (emoji: string) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder('Search emojis... (e.g., baby, medicine, sleep)');
		this.setInstructions([
			{ command: 'Type', purpose: 'to search by name or keyword' },
			{ command: '↑↓', purpose: 'to navigate' },
			{ command: '↵', purpose: 'to select' },
		]);
	}

	getItems(): EmojiItem[] {
		return EMOJI_DATA;
	}

	getItemText(item: EmojiItem): string {
		return `${item.name} ${item.keywords.join(' ')}`;
	}

	renderSuggestion(match: FuzzyMatch<EmojiItem>, el: HTMLElement): void {
		el.addClass('pt-emoji-suggest-item');
		el.createSpan({ text: match.item.emoji, cls: 'pt-emoji-suggest-icon' });
		el.createSpan({ text: match.item.name, cls: 'pt-emoji-suggest-name' });
	}

	onChooseItem(item: EmojiItem): void {
		this.onChoose(item.emoji);
	}
}
