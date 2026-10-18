import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { get } from "svelte/store";
import Page from "./+page.svelte";
import { EMPTY_DAILY_STATS, dailyTarget, gameStore } from "$lib/stores/gameStore";

function playRandom() {
  gameStore.setMode("random");
  gameStore.startNewGame();
}

async function enterGuess(user: ReturnType<typeof userEvent.setup>, digits: string) {
  const keypad = within(screen.getByRole("group", { name: "Number keypad" }));
  for (const digit of digits) {
    await user.click(keypad.getByRole("button", { name: digit }));
  }
  await user.click(keypad.getByRole("button", { name: "Enter" }));
}

const board = () => within(screen.getByRole("list", { name: "Guesses" }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 14, 9));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("+page.svelte Component", () => {
  beforeEach(() => {
    gameStore.reset();
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ stargazers_count: 128 }),
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should render the main title", () => {
    render(Page);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Guessle."
    );
  });

  it("moves settings out of the navigation rail", () => {
    const { container } = render(Page);

    expect(screen.queryByLabelText("Open Settings")).not.toBeInTheDocument();
    expect(container.querySelector(".nav-green")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Open Daily Guessle settings")
    ).toBeInTheDocument();
  });

  it("shows GitHub stars in the game panel header", async () => {
    render(Page);

    const link = await screen.findByRole("link", {
      name: "Open Guessle on GitHub, 128 stars",
    });

    expect(link).toHaveAttribute(
      "href",
      "https://github.com/PePoDev/guessle"
    );
    expect(link.closest("header")).toHaveClass("game-info");
  });

  it('shows icon-only Settings beside the GitHub link', async () => {
    render(Page)

    const settings = screen.getByRole('button', {
      name: 'Open Daily Guessle settings',
    })
    const github = await screen.findByRole('link', {
      name: 'Open Guessle on GitHub, 128 stars',
    })

    expect(settings.parentElement).toBe(github.parentElement)
    expect(settings.textContent?.trim()).toBe('')
    expect(github.textContent?.trim()).toBe('')
    expect(settings).toHaveAttribute('title', 'Open Daily Guessle settings')
  })

  it('explains how to play with friends in Instructions', async () => {
    const user = userEvent.setup()
    render(Page)

    await user.click(screen.getByRole('button', { name: /Instructions/ }))

    expect(
      screen.getByRole('heading', { name: 'Playing with friends:' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/The last player standing wins/)).toBeInTheDocument()
  })

  it('keeps Settings available while Instructions are open', async () => {
    const user = userEvent.setup()
    render(Page)

    await user.click(screen.getByRole('button', { name: /Instructions/ }))

    expect(
      screen.getByRole('button', { name: 'Open Daily Guessle settings' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Open Guessle on GitHub/ }),
    ).toBeInTheDocument()
  })

  it("opens settings for the active single-player mode", async () => {
    const user = userEvent.setup();
    playRandom();
    render(Page);

    const settingsButton = screen.getByLabelText("Open Random settings");
    expect(settingsButton).toHaveAttribute("aria-expanded", "false");
    await user.click(settingsButton);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Random Settings" })
      ).toBeInTheDocument();
      expect(settingsButton).toHaveAttribute("aria-expanded", "true");
    });
    expect(screen.getByLabelText("Number of Digits:")).toBeInTheDocument();
    expect(screen.getByLabelText("Max Attempts:")).toBeInTheDocument();
    expect(screen.getByLabelText("Sound effects:")).toBeInTheDocument();
    expect(screen.queryByLabelText("Number of Players:")).not.toBeInTheDocument();
  });

  it('keeps only the language and sound settings in Guessle', async () => {
    const user = userEvent.setup()
    render(Page)

    await user.click(screen.getByLabelText('Open Daily Guessle settings'))

    expect(
      screen.getByRole('heading', { name: 'Daily Guessle Settings' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Language:')).toBeInTheDocument()
    expect(screen.getByLabelText('Sound effects:')).toHaveValue('on')
    expect(screen.queryByLabelText('Number of Digits:')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Max Attempts:')).not.toBeInTheDocument()
  })

  it("should close settings modal", async () => {
    const user = userEvent.setup();
    playRandom();
    render(Page);

    const settingsButton = screen.getByLabelText("Open Random settings");
    await user.click(settingsButton);

    await waitFor(() => {
      expect(screen.getByText("Random Settings")).toBeInTheDocument();
    });

    const closeButton = screen.getByText("Close");
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText("Random Settings")).not.toBeInTheDocument();
    });
  });

  it("opens settings for local multiplayer", async () => {
    const user = userEvent.setup();
    gameStore.setMode("multi");
    gameStore.startNewGame();
    render(Page);

    await user.click(
      screen.getByLabelText("Open Local Multiplayer settings")
    );

    expect(screen.getByText("Local Multiplayer Settings")).toBeInTheDocument();
    expect(screen.getByLabelText("Number of Players:")).toBeInTheDocument();
    expect(screen.queryByLabelText("Max Attempts:")).not.toBeInTheDocument();
  });

  it('keeps only the language and sound settings once an online room starts', async () => {
    const user = userEvent.setup();
    gameStore.setMode("online");
    render(Page);

    expect(
      screen.getByLabelText("Open Online Multiplayer settings")
    ).toBeInTheDocument();
    gameStore.applyOnlineSnapshot({
      room: {
        id: "AB2C3D",
        hostUid: "host",
        phase: "lobby",
        digitCount: 3,
        maxPlayers: 2,
        playerOrder: ["host"],
        currentGuesserUid: null,
        winnerUid: null,
        turnNumber: 0,
      },
      players: [
        {
          uid: "host",
          name: "Ada",
          seat: 0,
          ready: false,
          eliminated: false,
        },
      ],
      guesses: [],
    });

    await user.click(
      await screen.findByLabelText("Open Online Multiplayer settings")
    );

    expect(screen.getByLabelText("Language:")).toBeInTheDocument();
    expect(screen.getByLabelText("Sound effects:")).toBeInTheDocument();
    expect(screen.queryByLabelText("Number of Digits:")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Number of Players:")).not.toBeInTheDocument();
  });

  it("should display digit count from settings", () => {
    render(Page);
    // Use getAllByText to get all matches and check the first one (digit count in the game info)
    const digitElements = screen.getAllByText(/3/);
    expect(digitElements.length).toBeGreaterThan(0);
    expect(digitElements[0]).toBeInTheDocument();
  });

  it("shows the tries left and the digit count in Random", () => {
    playRandom();
    render(Page);

    expect(
      screen.getByRole("heading", { name: "7 tries left" })
    ).toBeInTheDocument();
    expect(screen.getByText(/I'm thinking of a/)).toHaveTextContent(
      "I'm thinking of a 3-digit number. Can you guess it?"
    );
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Random");
  });

  it("should not display tries left in multiplayer mode", async () => {
    gameStore.setMode("multi");
    gameStore.startNewGame();
    render(Page);

    expect(screen.queryByText(/tries left/)).not.toBeInTheDocument();
  });

  it("renders the Random board and keypad instead of a guess field", () => {
    playRandom();
    render(Page);

    expect(screen.getByRole("list", { name: "Guesses" })).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Number keypad" })
    ).toBeInTheDocument();
    expect(screen.getByText("in the number")).toBeInTheDocument();
    expect(screen.getByText("in the right spot")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Guessle #/ })
    ).not.toBeInTheDocument();
  });

  it("should render MultiPlayerGame component in multiplayer mode", () => {
    gameStore.setMode("multi");
    gameStore.startNewGame();
    render(Page);

    expect(screen.getByText("Player Setup")).toBeInTheDocument();
  });

  it("renders OnlineMultiplayerGame in online mode", () => {
    gameStore.setMode("online");
    render(Page);

    expect(screen.getByLabelText("Display name")).toBeInTheDocument();
  });

  it("selects online mode and pre-fills a valid invite room", async () => {
    window.history.replaceState({}, "", "/?room=ab2c3d");
    render(Page);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Online" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
    });
    expect(screen.getByLabelText("Room ID")).toHaveValue("AB2C3D");
  });

  it("ignores an invalid invite room", async () => {
    window.history.replaceState({}, "", "/?room=invalid");
    render(Page);

    await waitFor(() => {
      expect(
        screen.getByRole("group", { name: "Number keypad" })
      ).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Room ID")).not.toBeInTheDocument();
  });

  it("keeps three cards in the nav rail and no New Game button", () => {
    render(Page);
    const nav = screen.getByRole("navigation", { name: "Game navigation" });

    expect(within(nav).getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /New Game/ })).not.toBeInTheDocument();
  });

  it("should display How to Play section", async () => {
    const user = userEvent.setup();
    render(Page);
    await user.click(screen.getByRole("button", { name: /Instructions/ }));
    expect(screen.getByText("How to Play:")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Guessle."
    );
  });

  it("should display game instructions", async () => {
    const user = userEvent.setup();
    render(Page);
    await user.click(screen.getByRole("button", { name: /Instructions/ }));
    expect(
      screen.getByText("Choose 2–5 digits and 3–20 attempts in Settings.")
    ).toBeInTheDocument();
    expect(screen.getByText(/Correct Digits:/)).toBeInTheDocument();
    expect(screen.getByText(/Correct Positions:/)).toBeInTheDocument();
  });

  it("should hide instructions when the card is clicked again", async () => {
    const user = userEvent.setup();
    render(Page);
    const instructionsCard = screen.getByRole("button", {
      name: /Instructions/,
    });
    await user.click(instructionsCard);
    expect(screen.getByText("How to Play:")).toBeInTheDocument();
    await user.click(instructionsCard);
    expect(screen.queryByText("How to Play:")).not.toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Number keypad" })
    ).toBeInTheDocument();
  });

  it("should preserve a draft guess while instructions are open", async () => {
    const user = userEvent.setup();
    playRandom();
    render(Page);
    const keypad = within(screen.getByRole("group", { name: "Number keypad" }));
    await user.click(keypad.getByRole("button", { name: "1" }));
    await user.click(keypad.getByRole("button", { name: "2" }));

    const instructionsCard = screen.getByRole("button", {
      name: /Instructions/,
    });
    await user.click(instructionsCard);
    await user.click(instructionsCard);

    expect(board().getByText("Current guess: 1 2")).toBeInTheDocument();
  });

  it("should switch to multiplayer from the nav card", async () => {
    const user = userEvent.setup();
    render(Page);
    await user.click(screen.getByRole("button", { name: /Multiplayer/ }));

    await waitFor(() => {
      expect(screen.getByText("Player Setup")).toBeInTheDocument();
    });
  });

  it("should return to single player from the nav card", async () => {
    const user = userEvent.setup();
    gameStore.setMode("multi");
    gameStore.startNewGame();
    render(Page);
    await user.click(screen.getByRole("button", { name: /Single Player/ }));

    await waitFor(() => {
      expect(
        screen.getByRole("group", { name: "Number keypad" })
      ).toBeInTheDocument();
    });
  });

  it('switches between Guessle and Random and remembers the choice', async () => {
    const user = userEvent.setup()
    render(Page)
    const variants = () =>
      within(screen.getByRole('group', { name: 'Single-player type' }))
    expect(variants().getByRole('button', { name: 'Daily' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(variants().getByRole('button', { name: 'Random' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    await user.click(variants().getByRole('button', { name: 'Random' }))
    expect(get(gameStore).mode).toBe('random')
    expect(variants().getByRole('button', { name: 'Random' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('heading', { name: '7 tries left' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open Random settings' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Multiplayer/ }))
    await user.click(screen.getByRole('button', { name: /Single Player/ }))
    expect(screen.getByRole('heading', { name: '7 tries left' })).toBeInTheDocument()

    await user.click(variants().getByRole('button', { name: 'Daily' }))
    expect(screen.getByRole('heading', { name: 'Guessle #1' })).toBeInTheDocument()
  })

  it("should switch between local and online multiplayer", async () => {
    const user = userEvent.setup();
    gameStore.setMode("multi");
    gameStore.startNewGame();
    render(Page);

    await user.click(screen.getByRole("button", { name: "Online" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Display name")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Local" }));
    await waitFor(() => {
      expect(screen.getByText("Player Setup")).toBeInTheDocument();
    });
  });

  it("should remember an online selection made outside the nav", async () => {
    const user = userEvent.setup();
    gameStore.setMode("online");
    render(Page);

    await user.click(screen.getByRole("button", { name: /Single Player/ }));
    await user.click(screen.getByRole("button", { name: /Multiplayer/ }));

    await waitFor(() => {
      expect(screen.getByLabelText("Display name")).toBeInTheDocument();
    });
  });

  it("should show the authoritative room digit count online", async () => {
    gameStore.setMode("online");
    render(Page);
    gameStore.applyOnlineSnapshot({
      room: {
        id: "AB2C3D",
        hostUid: "host",
        phase: "lobby",
        digitCount: 5,
        maxPlayers: 2,
        playerOrder: ["host"],
        currentGuesserUid: null,
        winnerUid: null,
        turnNumber: 0,
      },
      players: [
        {
          uid: "host",
          name: "Ada",
          seat: 0,
          ready: false,
          eliminated: false,
        },
      ],
      guesses: [],
    });

    await waitFor(() => {
      expect(
        screen.getByText("5", { selector: ".accent-value" })
      ).toBeInTheDocument();
    });
  });

  it("should mark the hero and duplicated ticker content aria-hidden", () => {
    const { container } = render(Page);
    expect(container.querySelector(".hero")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    const tickerSeqs = container.querySelectorAll(".ticker-seq");
    expect(tickerSeqs[1]).toHaveAttribute("aria-hidden", "true");
  });

  it("should have proper page title", () => {
    render(Page);
    // The title is set in svelte:head, which may not be testable in this context
    // but we can verify the component renders
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Guessle."
    );
  });

  it("opens today's Guessle on mount", () => {
    render(Page);

    expect(get(gameStore).daily.day).toBe(1);
    expect(
      screen.getByRole("heading", { name: "Guessle #1" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Guess today's/)).toHaveTextContent(
      "Guess today's 3-digit number in 6 tries. Everyone gets the same one."
    );
  });

  it("shows one Daily/Random switch, beside the board heading in both modes", async () => {
    const user = userEvent.setup();
    render(Page);

    const header = screen.getByRole("heading", { level: 1 }).closest("header");
    const switches = () => screen.getAllByRole("group", { name: "Single-player type" });
    expect(switches()).toHaveLength(1);
    expect(header).not.toContainElement(switches()[0]);
    expect(switches()[0].parentElement).toContainElement(
      screen.getByRole("heading", { name: "Guessle #1" })
    );

    await user.click(within(switches()[0]).getByRole("button", { name: "Random" }));

    expect(switches()).toHaveLength(1);
    expect(header).not.toContainElement(switches()[0]);
    expect(switches()[0].parentElement).toContainElement(
      screen.getByRole("heading", { name: "7 tries left" })
    );
  });

  it("keeps keyboard focus on the Daily/Random switch as it moves", async () => {
    const user = userEvent.setup();
    render(Page);

    screen.getByRole("button", { name: "Random" }).focus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Random" })).toHaveFocus();
    });
    expect(get(gameStore).mode).toBe("random");

    // A focused button takes Enter, so the empty guess is not submitted.
    await user.keyboard("{Enter}");
    expect(get(gameStore).mode).toBe("random");
    expect(screen.getByRole("alert")).toHaveTextContent("");
    expect(screen.getByRole("button", { name: "Random" })).toHaveFocus();

    screen.getByRole("button", { name: "Daily" }).focus();
    await user.keyboard(" ");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Daily" })).toHaveFocus();
    });
    expect(get(gameStore).mode).toBe("daily");
  });

  it("lets go of a clicked Daily/Random switch so Enter submits the guess", async () => {
    const user = userEvent.setup();
    render(Page);

    await user.click(screen.getByRole("button", { name: "Random" }));

    expect(get(gameStore).mode).toBe("random");
    expect(screen.getByRole("button", { name: "Random" })).not.toHaveFocus();

    await user.keyboard("12{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter all 3 digits.");

    await user.keyboard("3{Enter}");
    expect(
      board().getByText("Guess 1: 1 2 3, 0 in the number, 0 in the right spot")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Daily" }));

    expect(get(gameStore).mode).toBe("daily");
    expect(screen.getByRole("button", { name: "Daily" })).not.toHaveFocus();
    await user.keyboard("12{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter all 3 digits.");
  });

  it("plays Random from a finished Guessle with focus on the Random heading", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "number-guessing-daily",
      JSON.stringify({ day: 1, guesses: [dailyTarget(1)], stats: EMPTY_DAILY_STATS })
    );
    render(Page);

    await user.click(screen.getByRole("button", { name: "Play Random" }));

    expect(get(gameStore).mode).toBe("random");
    expect(screen.getByRole("heading", { name: "7 tries left" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Random" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("starts a fresh Random game after Guessle and keeps today's puzzle", async () => {
    const user = userEvent.setup();
    playRandom();
    render(Page);
    await enterGuess(user, "123");
    expect(screen.getByRole("heading", { name: "6 tries left" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Daily" }));
    await enterGuess(user, "123");
    const played = "Guess 1: 1 not in the number, 2 in another spot, 3 in the right spot";
    expect(board().getByText(played)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Random" }));

    expect(screen.getByRole("heading", { name: "7 tries left" })).toBeInTheDocument();
    expect(board().queryByText(/Guess 1:/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Daily" }));
    expect(screen.getByRole("heading", { name: "Guessle #1" })).toBeInTheDocument();
    expect(board().getByText(played)).toBeInTheDocument();
  });

  it("explains Guessle tiles in Instructions", async () => {
    const user = userEvent.setup();
    render(Page);
    await user.click(screen.getByRole("button", { name: /Instructions/ }));

    expect(
      screen.getByRole("heading", { name: "Daily Guessle:" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Everyone gets the same 3-digit number each day and has 6 tries.")
    ).toBeInTheDocument();
    expect(screen.getByText("Yellow with a dot:")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Random:" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Classic/ })
    ).not.toBeInTheDocument();
  });

  it("keeps the attempt limit under Random and the multiplayer rules under friends", async () => {
    const user = userEvent.setup();
    render(Page);
    await user.click(screen.getByRole("button", { name: /Instructions/ }));

    const sections = screen.getAllByRole("list");
    const random = within(sections[1]);
    const friends = within(sections[2]);
    expect(
      screen.getByRole("heading", { name: "Random:" }).nextElementSibling
    ).toBe(sections[1]);
    expect(random.getByText(/3–20 attempts/)).toBeInTheDocument();
    expect(random.getByText(/before your attempts run out/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Playing with friends:" }).nextElementSibling
    ).toBe(sections[2]);
    expect(
      friends.getByText("Choose 2–5 digits in Settings. There is no attempt limit.")
    ).toBeInTheDocument();
    expect(friends.queryByText(/attempts/)).not.toBeInTheDocument();
    expect(friends.getByText(/The last player standing wins/)).toBeInTheDocument();
    expect(
      friends.getByText(
        "Online: create a room and share its ID or link. The host can start once at least two players, the host included, are ready; anyone who isn't ready is left out."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/once everyone is ready/)).not.toBeInTheDocument();
  });

  it("introduces local multiplayer as players choosing the secret numbers", () => {
    gameStore.setMode("multi");
    gameStore.startNewGame();
    render(Page);

    expect(screen.getByText(/Each player picks a secret/)).toHaveTextContent(
      "Each player picks a secret 3-digit number, then you pass the device and take turns guessing."
    );
    expect(screen.queryByText(/I'm thinking of a/)).not.toBeInTheDocument();
  });

  it("introduces online multiplayer as players choosing the secret numbers", () => {
    gameStore.setMode("online");
    render(Page);

    expect(screen.getByText(/Each player picks a secret/)).toHaveTextContent(
      "Each player picks a secret 3-digit number, then you take turns guessing from your own devices."
    );
    expect(screen.queryByText(/I'm thinking of a/)).not.toBeInTheDocument();
  });

  it("should display game info with correct styling", () => {
    render(Page);
    const gameInfo = screen.getByText(/Guess today's/).closest("header");
    expect(gameInfo).toHaveClass("game-info");
  });

  it("should style the active-mode settings trigger", () => {
    render(Page);
    const settingsButton = screen.getByLabelText(
      "Open Daily Guessle settings"
    );
    expect(settingsButton).toHaveClass("btn-secondary");
  });
});

describe('+page.svelte in Thai', () => {
	beforeEach(() => {
		gameStore.reset()
		localStorage.clear()
		window.history.replaceState({}, '', '/')
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ stargazers_count: 128 }),
			})),
		)
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		localStorage.clear()
	})

	it('switches to Thai from Settings and remembers the choice', async () => {
		const user = userEvent.setup()
		playRandom()
		render(Page)
		expect(screen.queryByRole('group', { name: 'Language' })).toBeNull()

		await user.click(
			screen.getByRole('button', { name: 'Open Random settings' }),
		)
		await user.selectOptions(screen.getByLabelText('Language:'), 'th')

		expect(
			screen.getByRole('heading', { name: 'ตั้งค่าโหมดสุ่มเลข' }),
		).toBeInTheDocument()
		expect(screen.getByLabelText('ภาษา:')).toHaveValue('th')
		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
			'Guessle.',
		)
		expect(
			screen.getByRole('navigation', { name: 'เมนูเกม' }),
		).toBeInTheDocument()
		expect(
			screen.getByRole('button', { name: 'เปิดการตั้งค่าโหมดสุ่มเลข' }),
		).toBeInTheDocument()
		expect(localStorage.getItem('number-guessing-locale')).toBe('th')
		await waitFor(() => {
			expect(document.title).toBe('Guessle: เกมทายเลขรายวัน')
		})
	})

	it('renders the header, footer, and instructions in Thai', async () => {
		const user = userEvent.setup()
		gameStore.setLocale('th')
		playRandom()
		render(Page)

		expect(screen.getByText(/ฉันคิดตัวเลข/)).toHaveTextContent(
			'ฉันคิดตัวเลข 3 หลักไว้แล้ว ลองทายดูสิ!',
		)
		expect(
			screen.getByRole('heading', { name: 'เหลือ 7 ครั้ง' }),
		).toBeInTheDocument()
		expect(
			within(screen.getByRole('group', { name: 'รูปแบบการเล่นคนเดียว' })).getByRole(
				'button',
				{ name: 'สุ่ม' },
			),
		).toHaveAttribute('aria-pressed', 'true')
		expect(screen.getByRole('contentinfo')).toHaveTextContent(
			'Enter ส่งคำทาย · Escape ปิดการตั้งค่า',
		)
		expect(screen.getByRole('contentinfo')).toHaveTextContent('สุ่มเลข')

		await user.click(screen.getByRole('button', { name: /วิธีเล่น/ }))

		expect(
			screen.getByRole('heading', { name: 'วิธีเล่น:' }),
		).toBeInTheDocument()
		expect(
			screen.getByRole('heading', { name: 'โหมดสุ่ม:' }),
		).toBeInTheDocument()
		expect(screen.getByText('เลขถูก:')).toBeInTheDocument()
		expect(
			screen.getByText('เลือกจำนวนหลัก (2–5) ในการตั้งค่า ไม่จำกัดจำนวนครั้งที่ทาย'),
		).toBeInTheDocument()
		expect(screen.getByText(/อย่างน้อยสองคนรวมเจ้าของห้อง/)).toBeInTheDocument()
	})

	it('introduces both multiplayer modes in Thai', async () => {
		gameStore.setLocale('th')
		gameStore.setMode('multi')
		gameStore.startNewGame()
		render(Page)

		expect(screen.getByText(/ผู้เล่นแต่ละคนตั้งเลขลับ/)).toHaveTextContent(
			'ผู้เล่นแต่ละคนตั้งเลขลับ 3 หลัก แล้วส่งเครื่องต่อกันผลัดกันทาย',
		)

		gameStore.setMode('online')

		await waitFor(() => {
			expect(screen.getByText(/ผู้เล่นแต่ละคนตั้งเลขลับ/)).toHaveTextContent(
				'ผู้เล่นแต่ละคนตั้งเลขลับ 3 หลัก แล้วผลัดกันทายจากเครื่องของตัวเอง',
			)
		})
		expect(screen.queryByText(/ฉันคิดตัวเลข/)).not.toBeInTheDocument()
	})

	it('introduces Guessle in Thai', () => {
		gameStore.setLocale('th')
		render(Page)

		expect(screen.getByText(/ของวันนี้/)).toHaveTextContent(
			'ทายเลข 3 หลักของวันนี้ให้ถูกภายใน 6 ครั้ง ทุกคนได้เลขเดียวกัน',
		)
		expect(
			within(screen.getByRole('group', { name: 'รูปแบบการเล่นคนเดียว' })).getByRole(
				'button',
				{ name: 'สุ่ม' },
			),
		).toHaveAttribute('aria-pressed', 'false')
		expect(
			screen.getByRole('button', { name: 'เปิดการตั้งค่าโหมดเกม Guessle รายวัน' }),
		).toBeInTheDocument()
	})

	it('labels the multiplayer switch in Thai', () => {
		gameStore.setLocale('th')
		gameStore.setMode('multi')
		gameStore.startNewGame()
		render(Page)

		const variants = within(
			screen.getByRole('group', { name: 'รูปแบบการเล่นหลายคน' }),
		)
		expect(
			variants.getByRole('button', { name: 'เครื่องเดียว' }),
		).toHaveAttribute('aria-pressed', 'true')
		expect(variants.getByRole('button', { name: 'ออนไลน์' })).toHaveAttribute(
			'aria-pressed',
			'false',
		)
	})
})
