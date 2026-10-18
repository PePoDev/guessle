import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { get } from "svelte/store";
import MultiPlayerGame from "./MultiPlayerGame.svelte";
import { gameStore } from "$lib/stores/gameStore";

describe("MultiPlayerGame Component", () => {
  beforeEach(() => {
    gameStore.reset();
    gameStore.setMode("multi");
    gameStore.updateSettings({ playerCount: 2 });
    gameStore.startNewGame();
  });

  describe("Setup Phase", () => {
    it("should render setup phase UI", () => {
      render(MultiPlayerGame);

      expect(screen.getByText("Player Setup")).toBeInTheDocument();
      expect(
        screen.getByText(/Enter your name and secret number/)
      ).toBeInTheDocument();
    });

    it("should show current player setup turn", () => {
      render(MultiPlayerGame);
      expect(screen.getByText(/Player 1's turn to setup/)).toBeInTheDocument();
    });

    it("should have name and number inputs", () => {
      render(MultiPlayerGame);

      expect(
        screen.getByPlaceholderText("Enter your name")
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Enter your secret number")
      ).toBeInTheDocument();
    });

    it("should have save button", () => {
      render(MultiPlayerGame);
      expect(screen.getByText("Save & Continue")).toBeInTheDocument();
    });

    it('keeps only digits in local secret numbers', async () => {
      render(MultiPlayerGame)
      const input = screen.getByPlaceholderText('Enter your secret number')

      await fireEvent.input(input, { target: { value: '0a1-2' } })

      expect(input).toHaveValue('012')
    })

    it("should show inline feedback when the secret is empty", async () => {
      const user = userEvent.setup();
      render(MultiPlayerGame);

      await user.click(screen.getByText("Save & Continue"));

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Please enter a secret number."
      );
    });

    it("should allow entering player name and number", async () => {
      const user = userEvent.setup();
      render(MultiPlayerGame);

      const nameInput = screen.getByPlaceholderText(
        "Enter your name"
      ) as HTMLInputElement;
      const numberInput = screen.getByPlaceholderText(
        "Enter your secret number"
      ) as HTMLInputElement;

      await user.type(nameInput, "Alice");
      await user.type(numberInput, "123");

      expect(nameInput.value).toBe("Alice");
      expect(numberInput.value).toBe("123");
    });

    it("should save player setup and move to next player", async () => {
      const user = userEvent.setup();
      render(MultiPlayerGame);

      const nameInput = screen.getByPlaceholderText("Enter your name");
      const numberInput = screen.getByPlaceholderText(
        "Enter your secret number"
      );
      const saveButton = screen.getByText("Save & Continue");

      await user.type(nameInput, "Alice");
      await user.type(numberInput, "123");
      await user.click(saveButton);

      await waitFor(() => {
        expect(
          screen.getByText(/Player 2's turn to setup/)
        ).toBeInTheDocument();
      });
    });

    it("should use default name if none provided", async () => {
      const user = userEvent.setup();
      render(MultiPlayerGame);

      const numberInput = screen.getByPlaceholderText(
        "Enter your secret number"
      );
      const saveButton = screen.getByText("Save & Continue");

      await user.type(numberInput, "123");
      await user.click(saveButton);

      await waitFor(() => {
        expect(
          screen.getByText(/Player 2's turn to setup/)
        ).toBeInTheDocument();
      });
    });

    it("should transition to guessing phase after all players setup", async () => {
      const user = userEvent.setup();
      render(MultiPlayerGame);

      // Setup Player 1
      await user.type(screen.getByPlaceholderText("Enter your name"), "Alice");
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "123"
      );
      await user.click(screen.getByText("Save & Continue"));

      await waitFor(() => {
        expect(
          screen.getByText(/Player 2's turn to setup/)
        ).toBeInTheDocument();
      });

      // Setup Player 2
      await user.type(screen.getByPlaceholderText("Enter your name"), "Bob");
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "456"
      );
      await user.click(screen.getByText("Save & Continue"));

      await waitFor(() => {
        expect(screen.getByText("Guessing Phase")).toBeInTheDocument();
      });
    });

    it("should submit on Enter key press", async () => {
      const user = userEvent.setup();
      render(MultiPlayerGame);

      await user.type(screen.getByPlaceholderText("Enter your name"), "Alice");
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "123{Enter}"
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Player 2's turn to setup/)
        ).toBeInTheDocument();
      });
    });
  });

  describe("Guessing Phase", () => {
    beforeEach(async () => {
      const user = userEvent.setup();
      render(MultiPlayerGame);

      // Setup both players
      await user.type(screen.getByPlaceholderText("Enter your name"), "Alice");
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "123"
      );
      await user.click(screen.getByText("Save & Continue"));

      await waitFor(() => screen.getByText(/Player 2's turn to setup/));

      await user.type(screen.getByPlaceholderText("Enter your name"), "Bob");
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "456"
      );
      await user.click(screen.getByText("Save & Continue"));

      await waitFor(() => screen.getByText("Guessing Phase"));
    });

    it("should render guessing phase UI", () => {
      expect(screen.getByText("Guessing Phase")).toBeInTheDocument();
    });

    it("should show current guesser", () => {
      expect(screen.getByText(/Alice's turn to guess/)).toBeInTheDocument();
    });

    it("should display player cards", () => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getAllByText("Bob").length).toBeGreaterThan(0);
    });

    it("should have target player selector", () => {
      expect(screen.getByLabelText("Guess for:")).toBeInTheDocument();
    });

    it("should have guess input and submit button", () => {
      expect(screen.getByRole("textbox", { name: "Guess" })).toBeInTheDocument();
      expect(screen.getByText("Submit Guess")).toBeInTheDocument();
    });

    it('keeps only digits in local guesses', async () => {
      const input = screen.getByLabelText('Guess')

      await fireEvent.input(input, { target: { value: '4x5-6' } })

      expect(input).toHaveValue('456')
    })

    it("should announce the current turn", () => {
      expect(screen.getByText(/Alice's turn to guess/)).toHaveAttribute(
        "aria-live",
        "polite"
      );
    });

    it("should allow making a guess", async () => {
      const user = userEvent.setup();

      const guessInput = screen.getByPlaceholderText("Enter guess");
      await user.type(guessInput, "456");
      await user.click(screen.getByText("Submit Guess"));

      await waitFor(() => {
        // Check that game ended (Alice guessed Bob's number correctly)
        expect(screen.getByText("Game Over!")).toBeInTheDocument();
      });
    });

    it("should mark the newest guess in history", async () => {
      const user = userEvent.setup();

      await user.type(screen.getByRole("textbox", { name: "Guess" }), "111");
      await user.click(screen.getByText("Submit Guess"));

      const row = screen.getByText(/Alice: 111/).closest(".history-row");
      expect(row).toHaveClass("history-row-newest");
    });

    it("should submit guess on Enter key", async () => {
      const user = userEvent.setup();

      const guessInput = screen.getByPlaceholderText("Enter guess");
      await user.type(guessInput, "456{Enter}");

      await waitFor(() => {
        // Check that game ended (Alice guessed Bob's number correctly)
        expect(screen.getByText("Game Over!")).toBeInTheDocument();
      });
    });

    it("should highlight active player", () => {
      const aliceCard = screen.getByRole("group", { name: "Alice" });
      expect(aliceCard).toHaveClass("player-card-turn");
    });

    it("should not allow guessing own number", () => {
      const select = screen.getByLabelText("Guess for:") as HTMLSelectElement;
      const options = Array.from(select.options).map((opt) => opt.text);

      // Alice is current guesser, so she shouldn't be in the target list
      expect(options).not.toContain("Alice");
      expect(options).toContain("Bob");
    });
  });

  describe("Finished Phase", () => {
    it("should show winner when game ends", async () => {
      const user = userEvent.setup();
      render(MultiPlayerGame);

      // Setup players
      await user.type(screen.getByPlaceholderText("Enter your name"), "Alice");
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "123"
      );
      await user.click(screen.getByText("Save & Continue"));

      await waitFor(() => screen.getByText(/Player 2's turn to setup/));

      await user.type(screen.getByPlaceholderText("Enter your name"), "Bob");
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "456"
      );
      await user.click(screen.getByText("Save & Continue"));

      await waitFor(() => screen.getByText("Guessing Phase"));

      // Alice guesses Bob's number correctly
      await user.type(screen.getByPlaceholderText("Enter guess"), "456");
      await user.click(screen.getByText("Submit Guess"));

      await waitFor(() => {
        expect(screen.getByText("Game Over!")).toBeInTheDocument();
        expect(screen.getByText(/Alice wins!/)).toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: "Submit Guess" })
        ).not.toBeInTheDocument();
        expect(
          screen.getByRole("group", { name: "Bob eliminated" })
        ).toHaveTextContent("Eliminated");
      });
    });
  });

  describe("Three Player Game", () => {
    beforeEach(() => {
      gameStore.reset();
      gameStore.setMode("multi");
      gameStore.updateSettings({ playerCount: 3 });
      gameStore.startNewGame();
    });

    it("should handle three player setup", async () => {
      const user = userEvent.setup();
      render(MultiPlayerGame);

      // Setup Player 1
      await user.type(screen.getByPlaceholderText("Enter your name"), "Alice");
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "123"
      );
      await user.click(screen.getByText("Save & Continue"));

      await waitFor(() => screen.getByText(/Player 2's turn to setup/));

      // Setup Player 2
      await user.type(screen.getByPlaceholderText("Enter your name"), "Bob");
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "456"
      );
      await user.click(screen.getByText("Save & Continue"));

      await waitFor(() => screen.getByText(/Player 3's turn to setup/));

      // Setup Player 3
      await user.type(
        screen.getByPlaceholderText("Enter your name"),
        "Charlie"
      );
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "789"
      );
      await user.click(screen.getByText("Save & Continue"));

      await waitFor(() => {
        expect(screen.getByText("Guessing Phase")).toBeInTheDocument();
        expect(screen.getByText("Alice")).toBeInTheDocument();
        expect(screen.getAllByText("Bob").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Charlie").length).toBeGreaterThan(0);
      });
    });

    it("should require the full digit count for a secret number", async () => {
      const user = userEvent.setup();
      render(MultiPlayerGame);

      await user.type(screen.getByPlaceholderText("Enter your name"), "Alice");
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "12"
      );
      await user.click(screen.getByText("Save & Continue"));

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Please enter exactly 3 digits."
      );
      expect(screen.getByText(/Player 1's turn to setup/)).toBeInTheDocument();
      expect(get(gameStore).players[0].number).toBe("");
    });

    it("should filter a non-digit guess before submission", async () => {
      const user = userEvent.setup();

      // Reset and configure for 2 players
      gameStore.reset();
      gameStore.setMode("multi");
      gameStore.updateSettings({ playerCount: 2 });
      gameStore.startNewGame();

      render(MultiPlayerGame);

      // Setup both players
      await user.type(screen.getByPlaceholderText("Enter your name"), "Alice");
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "123"
      );
      await user.click(screen.getByText("Save & Continue"));

      await waitFor(() => screen.getByText(/Player 2's turn to setup/));

      await user.type(screen.getByPlaceholderText("Enter your name"), "Bob");
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "456"
      );
      await user.click(screen.getByText("Save & Continue"));

      await waitFor(() => screen.getByText("Guessing Phase"), {
        timeout: 3000,
      });

      const input = screen.getByPlaceholderText("Enter guess");
      const guessCount = get(gameStore).players.reduce(
        (total, player) => total + player.guesses.length,
        0,
      );
      await user.type(input, "abc");
      await user.click(screen.getByText("Submit Guess"));

      expect(input).toHaveValue("");
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Please enter a number before submitting.",
      );
      expect(
        get(gameStore).players.reduce(
          (total, player) => total + player.guesses.length,
          0,
        ),
      ).toBe(guessCount);
    });

    it("should require the full digit count for a guess", async () => {
      const user = userEvent.setup();

      // Reset and configure for 2 players
      gameStore.reset();
      gameStore.setMode("multi");
      gameStore.updateSettings({ playerCount: 2 });
      gameStore.startNewGame();

      render(MultiPlayerGame);

      // Setup both players
      await user.type(screen.getByPlaceholderText("Enter your name"), "Alice");
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "123"
      );
      await user.click(screen.getByText("Save & Continue"));

      await waitFor(() => screen.getByText(/Player 2's turn to setup/));

      await user.type(screen.getByPlaceholderText("Enter your name"), "Bob");
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "012"
      );
      await user.click(screen.getByText("Save & Continue"));

      await waitFor(() => screen.getByText("Guessing Phase"), {
        timeout: 3000,
      });

      await user.type(screen.getByPlaceholderText("Enter guess"), "12");
      await user.click(screen.getByText("Submit Guess"));

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Please enter exactly 3 digits."
      );
      expect(screen.queryByText("Game Over!")).not.toBeInTheDocument();

      await user.clear(screen.getByPlaceholderText("Enter guess"));
      await user.type(screen.getByPlaceholderText("Enter guess"), "012");
      await user.click(screen.getByText("Submit Guess"));

      await waitFor(() => {
        expect(screen.getByText("Game Over!")).toBeInTheDocument();
      });
    });

    it("should move to next guesser after incorrect guess", async () => {
      const user = userEvent.setup();
      gameStore.reset();
      gameStore.setMode("multi");
      gameStore.updateSettings({ playerCount: 3 });
      gameStore.startNewGame();

      render(MultiPlayerGame);

      // Setup three players
      await user.type(screen.getByPlaceholderText("Enter your name"), "Alice");
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "123"
      );
      await user.click(screen.getByText("Save & Continue"));

      await waitFor(() => screen.getByText(/Player 2's turn to setup/));

      await user.type(screen.getByPlaceholderText("Enter your name"), "Bob");
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "456"
      );
      await user.click(screen.getByText("Save & Continue"));

      await waitFor(() => screen.getByText(/Player 3's turn to setup/));

      await user.type(
        screen.getByPlaceholderText("Enter your name"),
        "Charlie"
      );
      await user.type(
        screen.getByPlaceholderText("Enter your secret number"),
        "789"
      );
      await user.click(screen.getByText("Save & Continue"));

      await waitFor(() => screen.getByText("Guessing Phase"));

      // Alice's turn - make incorrect guess
      expect(screen.getByText(/Alice's turn to guess/)).toBeInTheDocument();

      await user.type(screen.getByPlaceholderText("Enter guess"), "111");
      await user.click(screen.getByText("Submit Guess"));

      // Should move to Bob's turn
      await waitFor(() => {
        expect(screen.getByText(/Bob's turn to guess/)).toBeInTheDocument();
      });
    });
  });
});

describe('MultiPlayerGame in Thai', () => {
	beforeEach(() => {
		gameStore.reset()
		gameStore.setLocale('th')
		gameStore.setMode('multi')
		gameStore.updateSettings({ playerCount: 2 })
		gameStore.startNewGame()
	})

	it('names unnamed players in the active language', async () => {
		render(MultiPlayerGame)

		expect(screen.getByText('ถึงตา ผู้เล่น 1 ตั้งค่า')).toBeInTheDocument()

		gameStore.setLocale('en')

		await waitFor(() => {
			expect(screen.getByText("Player 1's turn to setup")).toBeInTheDocument()
		})
	})

	it('keeps a blank name so the default follows the language', async () => {
		const user = userEvent.setup()
		render(MultiPlayerGame)

		await user.type(screen.getByLabelText('เลขลับ:'), '123')
		await user.click(screen.getByRole('button', { name: 'บันทึกและไปต่อ' }))

		expect(screen.getByText('ถึงตา ผู้เล่น 2 ตั้งค่า')).toBeInTheDocument()
		expect(get(gameStore).players[0].name).toBe('')
	})

	it('shows Thai validation and guessing copy', async () => {
		const user = userEvent.setup()
		render(MultiPlayerGame)

		await user.click(screen.getByRole('button', { name: 'บันทึกและไปต่อ' }))
		expect(screen.getByRole('alert')).toHaveTextContent('กรุณาใส่เลขลับ')

		for (const secret of ['123', '456']) {
			await user.type(screen.getByLabelText('เลขลับ:'), secret)
			await user.click(screen.getByRole('button', { name: 'บันทึกและไปต่อ' }))
		}

		expect(screen.getByText('ช่วงทายเลข')).toBeInTheDocument()
		expect(screen.getByText('ถึงตา ผู้เล่น 1 ทาย')).toBeInTheDocument()
		expect(screen.getByLabelText('ทายเลขของ:')).toHaveDisplayValue('ผู้เล่น 2')
	})
})

describe('MultiPlayerGame pass-and-play', () => {
	beforeEach(() => {
		gameStore.reset()
		gameStore.setMode('multi')
		gameStore.updateSettings({ playerCount: 2 })
		gameStore.startNewGame()
	})

	async function setUp(
		user: ReturnType<typeof userEvent.setup>,
		players: Array<[string, string]>,
	) {
		for (const [name, secret] of players) {
			const nameField = screen.getByLabelText('Name:')
			await user.clear(nameField)
			await user.type(nameField, name)
			await user.type(screen.getByLabelText('Secret Number:'), secret)
			await user.click(screen.getByRole('button', { name: 'Save & Continue' }))
		}
	}

	async function guess(user: ReturnType<typeof userEvent.setup>, value: string) {
		await user.type(screen.getByLabelText('Guess'), value)
		await user.click(screen.getByRole('button', { name: 'Submit Guess' }))
	}

	it('masks the secret number until the player reveals it', async () => {
		const user = userEvent.setup()
		render(MultiPlayerGame)
		const secret = screen.getByLabelText('Secret Number:')
		await user.type(secret, '123')

		expect(secret).toHaveAttribute('type', 'password')

		await user.click(screen.getByRole('button', { name: 'Show secret number' }))
		expect(secret).toHaveAttribute('type', 'text')
		expect(
			screen.getByRole('button', { name: 'Hide secret number' }),
		).toHaveAttribute('aria-pressed', 'true')

		await user.click(screen.getByRole('button', { name: 'Save & Continue' }))

		expect(screen.getByLabelText('Secret Number:')).toHaveAttribute(
			'type',
			'password',
		)
	})

	it('lists the newest guess first with readable scores', async () => {
		const user = userEvent.setup()
		render(MultiPlayerGame)
		await setUp(user, [
			['Alice', '123'],
			['Bob', '789'],
		])

		await guess(user, '456')
		await guess(user, '120')
		await guess(user, '781')

		const rows = within(screen.getByRole('group', { name: 'Bob' })).getAllByText(
			/^Alice: /,
		)
		expect(rows.map((row) => row.textContent)).toEqual([
			'Alice: 781',
			'Alice: 456',
		])
		expect(
			within(screen.getByRole('group', { name: 'Bob' })).getByText(
				'Digits 2 · Positions 2',
			),
		).toBeInTheDocument()
	})

	it('offers a rematch that keeps everyone’s names', async () => {
		const user = userEvent.setup()
		render(MultiPlayerGame)
		await setUp(user, [
			['Alice', '123'],
			['Bob', '789'],
		])

		await guess(user, '789')
		expect(screen.getByText('Alice wins!')).toBeInTheDocument()

		await user.click(screen.getByRole('button', { name: 'Play again' }))

		expect(screen.getByText("Alice's turn to setup")).toBeInTheDocument()
		expect(screen.getByLabelText('Name:')).toHaveValue('Alice')
		await waitFor(() => {
			expect(screen.getByLabelText('Name:')).toHaveFocus()
		})
		expect(screen.getByLabelText('Secret Number:')).toHaveValue('')

		await user.type(screen.getByLabelText('Secret Number:'), '321')
		await user.click(screen.getByRole('button', { name: 'Save & Continue' }))

		expect(screen.getByLabelText('Name:')).toHaveValue('Bob')
	})
})

describe('MultiPlayerGame turn handling', () => {
	beforeEach(() => {
		gameStore.reset()
		gameStore.setMode('multi')
	})

	async function setUpPlayers(
		user: ReturnType<typeof userEvent.setup>,
		secrets: string[],
	) {
		gameStore.updateSettings({ playerCount: secrets.length })
		gameStore.startNewGame()
		render(MultiPlayerGame)
		for (const secret of secrets) {
			await user.type(screen.getByLabelText('Secret Number:'), secret)
			await user.click(screen.getByRole('button', { name: 'Save & Continue' }))
		}
	}

	async function guess(user: ReturnType<typeof userEvent.setup>, value: string) {
		await user.type(screen.getByLabelText('Guess'), value)
		await user.click(screen.getByRole('button', { name: 'Submit Guess' }))
	}

	it('moves focus to the guess field once setup ends', async () => {
		const user = userEvent.setup()
		await setUpPlayers(user, ['123', '456'])

		await waitFor(() => {
			expect(screen.getByLabelText('Guess')).toHaveFocus()
		})
	})

	it('keeps the chosen target when the language changes', async () => {
		const user = userEvent.setup()
		await setUpPlayers(user, ['123', '456', '789'])
		await user.selectOptions(screen.getByLabelText('Guess for:'), '2')

		gameStore.setLocale('th')

		await waitFor(() => {
			expect(screen.getByLabelText('ทายเลขของ:')).toHaveValue('2')
		})
	})

	it('moves the target off a player who was just eliminated', async () => {
		const user = userEvent.setup()
		await setUpPlayers(user, ['123', '456', '789'])
		await user.selectOptions(screen.getByLabelText('Guess for:'), '2')

		await guess(user, '789')

		expect(screen.getByText("Player 1's turn to guess")).toBeInTheDocument()
		expect(screen.getByLabelText('Guess for:')).toHaveValue('1')
		expect(
			screen.queryByRole('option', { name: 'Player 3' }),
		).not.toBeInTheDocument()
	})

	it('announces each guess result and focuses the result at the end', async () => {
		const user = userEvent.setup()
		await setUpPlayers(user, ['123', '456'])

		await guess(user, '465')
		expect(screen.getByRole('status')).toHaveTextContent(
			'Player 1 guessed 465 for Player 2: 3 correct digits, 1 in the right position.',
		)
		await waitFor(() => {
			expect(screen.getByLabelText('Guess')).toHaveFocus()
		})

		await guess(user, '123')

		expect(screen.getByRole('status')).toHaveTextContent(
			"Player 2 guessed Player 1's number. Player 1 is out.",
		)
		await waitFor(() => {
			expect(screen.getByText('Game Over!').closest('header')).toHaveFocus()
		})
	})

	it('clears warnings and typed numbers when a new game starts', async () => {
		const user = userEvent.setup()
		gameStore.updateSettings({ playerCount: 2, digitCount: 4 })
		gameStore.startNewGame()
		render(MultiPlayerGame)
		await user.type(screen.getByLabelText('Secret Number:'), '12')
		await user.click(screen.getByRole('button', { name: 'Save & Continue' }))
		expect(screen.getByRole('alert')).toHaveTextContent(
			'Please enter exactly 4 digits.',
		)

		gameStore.updateSettings({ digitCount: 3 })
		gameStore.startNewGame()

		await waitFor(() => {
			expect(screen.getByRole('alert').textContent?.trim()).toBe('')
		})
		expect(screen.getByLabelText('Secret Number:')).toHaveValue('')
	})

	// jsdom does not lay out, so this pins the call; e2e/layout.spec.ts checks
	// that the field really stays inside the panel on a phone.
	it('brings the guess row back into view when guessing starts and after each Enter', async () => {
		const scrollIntoView = vi.fn()
		Object.defineProperty(Element.prototype, 'scrollIntoView', {
			configurable: true,
			value: scrollIntoView,
		})
		try {
			const user = userEvent.setup()
			await setUpPlayers(user, ['123', '456'])
			expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
			scrollIntoView.mockClear()

			await user.type(screen.getByLabelText('Guess'), '111{Enter}')

			expect(screen.getByLabelText('Guess')).toHaveFocus()
			expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
			const row = scrollIntoView.mock.contexts.at(-1) as Element
			expect(row).toContainElement(screen.getByLabelText('Guess'))
			expect(row).toContainElement(
				screen.getByRole('button', { name: 'Submit Guess' }),
			)
		} finally {
			Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
		}
	})

	it('ignores Enter while an input method is composing', async () => {
		gameStore.updateSettings({ playerCount: 2 })
		gameStore.startNewGame()
		render(MultiPlayerGame)
		const secret = screen.getByLabelText('Secret Number:')
		await fireEvent.input(secret, { target: { value: '123' } })

		await fireEvent.keyDown(secret, { key: 'Enter', isComposing: true })
		expect(screen.getByText("Player 1's turn to setup")).toBeInTheDocument()

		await fireEvent.keyDown(secret, { key: 'Enter' })
		expect(screen.getByText("Player 2's turn to setup")).toBeInTheDocument()
	})
})
