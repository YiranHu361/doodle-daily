export type ClipPlayer = {
  play(url: string): void;
  stop(): void;
};

export type NarrationInput = {
  page: number;
  url: string | null;
  active: boolean;
};

export type Clips = { panels: (string | null)[]; realStory: string | null };

export const REAL_STORY_PAGE = 4;

export function clipForPage(clips: Clips | null | undefined, page: number): string | null {
  if (!clips) return null;
  if (page === REAL_STORY_PAGE) return clips.realStory;
  return clips.panels[page] ?? null;
}

export function createNarration(player: ClipPlayer) {
  let page: number | null = null;
  let started = false;
  let playing = false;

  function stop() {
    if (playing) player.stop();
    playing = false;
  }

  return {
    update(input: NarrationInput) {
      if (!input.active) {
        stop();
        page = null;
        started = false;
        return;
      }
      if (input.page !== page) {
        stop();
        page = input.page;
        started = false;
      }
      if (started || !input.url) return;
      started = true;
      playing = true;
      player.play(input.url);
    },
    finished() {
      playing = false;
    },
    dispose() {
      stop();
      page = null;
      started = false;
    },
  };
}
