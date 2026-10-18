<script lang="ts">
    import { gameStore, type GameMode, type GameSettings } from '$lib/stores/gameStore';
    import { locales, messages } from '$lib/i18n/messages';
    import { isLocale, storeLocale } from '$lib/i18n/locale';
    import { storeSoundSetting } from '$lib/effects/celebrate';
    
    interface Props {
        mode: GameMode;
        onclose: () => void;
    }
    
    let { mode, onclose }: Props = $props();
    
    let scrimEl: HTMLDivElement | undefined = $state(undefined);
    let previouslyFocused: HTMLElement | null = null;
    
    const t = $derived(messages[$gameStore.locale]);
    // Guessle and a started online room own their rules, so only the language and sound stay editable.
    const gameSettingsLocked = $derived(
        mode === 'daily' || (mode === 'online' && $gameStore.online.room !== null)
    );
    
    const counts = (values: number[], label: (count: number) => string) =>
        values.map((value) => ({ value: String(value), label: label(value) }));

    function setting(key: keyof GameSettings) {
        return (value: string) => {
            gameStore.updateSettings({ [key]: Number(value) });
            gameStore.startNewGame();
        };
    }
    
    function setLocale(value: string) {
        if (isLocale(value)) {
            gameStore.setLocale(value);
            storeLocale(value);
        }
    }
    
    function setSound(value: string) {
        const on = value === 'on';
        gameStore.setSound(on);
        storeSoundSetting(on);
    }

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            onclose();
        }
    }
    
    function focusableElements(): HTMLElement[] {
        if (!scrimEl) return [];
        return Array.from(
            scrimEl.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
        ).filter((el) => !el.hasAttribute('disabled'));
    }
    
    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            onclose();
            return;
        }
        if (e.key !== 'Tab') return;
        const focusables = focusableElements();
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        // The scrim itself takes focus when the panel background is clicked.
        const outside = active === scrimEl || !scrimEl?.contains(active);
        if (e.shiftKey && (active === first || outside)) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (active === last || outside)) {
            e.preventDefault();
            first.focus();
        }
    }
    
    $effect(() => {
        previouslyFocused = document.activeElement as HTMLElement | null;
        focusableElements()[0]?.focus();
        return () => {
            previouslyFocused?.focus();
        };
    });
</script>

{#snippet field(
    id: string,
    label: string,
    value: string | number,
    options: { value: string; label: string; lang?: string }[],
    onchange: (value: string) => void,
)}
    <div class="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <label for={id} class="font-semibold">{label}</label>
        <select
            {id}
            value={String(value)}
            onchange={(event) => onchange(event.currentTarget.value)}
            class="field-select w-full sm:w-auto"
        >
            {#each options as option (option.value)}
                <option value={option.value} lang={option.lang}>{option.label}</option>
            {/each}
        </select>
    </div>
{/snippet}

<div
    class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--scrim-bg)] p-4 backdrop-blur-md"
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
    tabindex="-1"
    onkeydown={handleKeydown}
    bind:this={scrimEl}
>
    <div class="panel animate-modal-slide-in my-auto w-full max-w-[480px]">
        <div class="flex items-center justify-between border-b-[1.5px] border-[var(--glass-border)] p-5">
            <h2 id="settings-title" class="font-display text-2xl font-bold">{t.settings.titles[mode]}</h2>
            <button
                onclick={onclose}
                class="btn-secondary flex h-12 w-12 items-center justify-center rounded-full !p-0"
                aria-label={t.settings.closeLabel}
            >
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
					<path d="M6 6l12 12M18 6 6 18" />
				</svg>
            </button>
        </div>
        
        <div class="space-y-5 p-5">
            {#if !gameSettingsLocked}
                {#if mode !== 'random'}
                    {@render field('player-count', t.settings.players, $gameStore.settings.playerCount, counts([2, 3, 4], t.settings.playerOption), setting('playerCount'))}
                {/if}
                {@render field('digit-count', t.settings.digits, $gameStore.settings.digitCount, counts([2, 3, 4, 5], t.settings.digitOption), setting('digitCount'))}
                {#if mode === 'random'}
                    {@render field('max-attempts', t.settings.attempts, $gameStore.settings.maxAttempts, counts([3, 5, 7, 10, 15, 20], t.settings.attemptOption), setting('maxAttempts'))}
                {/if}
                <!-- Online has no game to restart until a room exists; the options only shape the next one. -->
                <p class="text-sm text-[var(--glass-muted)]">{mode === 'online' ? t.settings.nextRoomHint : t.settings.restartHint}</p>
            {/if}
            {@render field('language', t.settings.language, $gameStore.locale, locales.map((locale) => ({ value: locale, label: messages[locale].languageName, lang: locale })), setLocale)}
            {@render field('sound', t.settings.sound, $gameStore.sound ? 'on' : 'off', [{ value: 'on', label: t.settings.soundOn }, { value: 'off', label: t.settings.soundOff }], setSound)}
        </div>
        
        <div class="border-t-[1.5px] border-[var(--glass-border)] p-5 text-center">
            <button onclick={onclose} class="btn-primary px-8">
                {t.settings.close}
            </button>
        </div>
    </div>
</div>

<style>
	@keyframes modal-slide-in {
		from {
			opacity: 0;
			transform: translateY(-12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	
	.animate-modal-slide-in {
		animation: modal-slide-in var(--motion-duration) var(--motion-easing);
	}
</style>
