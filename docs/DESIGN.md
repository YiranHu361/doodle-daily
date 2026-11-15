# Doodle Daily: design

A neon arcade cabinet that prints a crayon newspaper. The shell is dark, sharp
and glowing; the comics are soft, bright sheets of paper. One rule holds it
together: **neon never touches paper.** Paper sheets get no neon border, no glow
on top, no tinted overlay; the glow sits behind them like a backlight.

No warm-orange-on-cream look and no serif type anywhere.

## 1. Colour

| Token | Hex | Use |
| --- | --- | --- |
| bg.void | `#07051A` | status bar area, deepest background |
| bg.night | `#100B2E` | screen background (with a faint grid, lines `#1A1446`) |
| surface.1 | `#1A1446` | cards |
| surface.2 | `#261E63` | buttons, chips, tiles |
| surface.3 | `#352A85` | pressed, raised |
| line.dim | `#4A3FA8` | hairlines, idle borders |
| line.bright | `#6E63D9` | active borders |
| text.hi | `#F5F2FF` | titles |
| text.mid | `#BDB6EC` | body |
| text.low | `#9A92D6` | meta, hints |
| text.onNeon | `#140F33` | text on volt or other neon fills |
| neon.volt | `#FFE83D` | primary action, combo, "All" chip |
| neon.cyan | `#2DE2FF` | Tech |
| neon.lime | `#7CFF6B` | Money |
| neon.pink | `#FF4FB8` | Culture, combo at risk |
| neon.violet | `#A98BFF` | Memes |
| state.error | `#FF5C7A` | errors |
| paper | `#FBF7EC` | comic sheets, speech bubble |
| ink | `#1B1736` | text on paper |
| stamp | `#C2185B` | READ stamp |
| robo.body | `#3D8BFF` (shade `#2A63D6`, screen `#0B0820`, eyes `#2DE2FF`) | Robo |

Month grid heat (comics read that day): none `#261E63` with a `#4A3FA8` border;
1 = `#C4AF47`; 2 to 3 = `#E6D141`; 4+ = `#FFE83D`. Cleared days show a small bolt
and use text.onNeon. A cleared day must read as lit at a glance.

Contrast: body text 4.5:1 or better everywhere.

## 2. Type

| Role | Family | Size / weight |
| --- | --- | --- |
| Display (wordmark, "DAY CLEARED", "THE REAL STORY", big numbers, stamps) | Bungee | 22 to 64, caps |
| UI (titles, buttons, chips, body, meta) | Chakra Petch | title 24 SemiBold, body 17 Regular, button 17 SemiBold, chip 15 Medium, meta 13 |
| Captions on paper | Balsamiq Sans | 18 Regular, never below 17 |

Load with `@expo-google-fonts/bungee`, `/chakra-petch`, `/balsamiq-sans`. Support
Dynamic Type: text scales, rows wrap, nothing truncates a title.

## 3. Shape and light

- **Cut corners.** Cards, buttons, chips and tiles are rectangles with the top
  left and bottom right corners cut at 45 degrees (cut 6 on chips, 10 on buttons,
  14 on cards). Draw with SVG paths or a clip; never plain rounded rectangles.
- **Neon tube border.** A 1.5 pt stroke in the section colour plus a soft outer
  glow (blur about 8, 45% opacity). Idle elements use line.dim with no glow.
- **Paper sheet.** Off-white, slightly irregular hand-cut outline (a wobbly
  rounded square), thin dark edge, a soft section-coloured backlight behind it.
- **Primary button.** Volt fill, onNeon text, cut corners, volt glow; full width
  minus 16 pt margins.
- **Stamp.** "READ" in Bungee inside a tilted pill, paper fill, stamp-red border
  and text, rotated about 8 degrees, overlapping a card's top right corner.
- Screen margin 16, card gap 16, minimum touch target 44.

## 4. Screens

**Today.** Top: small date ("Saturday, Nov 14"), an "ISSUE 2" tag (volt Bungee on
surface.2), the wordmark on two lines ("DOODLE" in paper white with a volt
underline swoosh, "DAILY" in cyan-white with a cyan glow), Robo at the right, and
above Robo the combo pill (bolt + number in a cut-corner tube; volt when today is
cleared, dim outline when not, pink when at risk). The chip row pins under the
status bar when scrolling; the selected chip has its section colour border, a dot
and tinted text; all five fit on a 390 pt screen. Lead card: paper cover nearly
full width, then tag and title, tube border in the section colour. Row cards: 96
pt paper thumbnail left, tag and two-line title right. Footer: "Back issues"
secondary button and "That's the whole issue. Go outside." The "Draw a fresh one"
button floats above the bottom edge over a fade to bg.night; the list has enough
bottom padding to scroll clear of it.

**Reader.** Close button (cut-corner square) top left, five progress pips in the
section colour (the fifth is a small dot for the Real story), "1/4" in Bungee top
right (a compass icon on the Real story page). Tag, title (two lines max). The
paper sheet is centred between title and bottom bar, as wide as fits, with the
square picture on top and the caption below it on the same sheet. Bottom bar:
three reaction tiles (small Robo-face icons: grinning, wide-eyed, wincing) with
counts, and a Share button at the right. The selected reaction gets the section
colour border and glow.

**Real story (page 5).** A surface.1 card with a tube border: a row of four small
paper thumbnails, "THE REAL STORY" in Bungee, the summary in body text, "Source"
label and source name, and a volt "Open source" button. READ stamp on the corner.

**Celebration.** Dims the Reader. Robo cheering, "DAY CLEARED" in volt Bungee,
bolt and the combo number very large, "day combo", the week strip (S M T W T F S,
today's cell filling volt with a bolt), a paper speech bubble with one line from
Robo, and a volt "Keep reading" button.

**Combo sheet.** Robo, "Your combo" and a status line, the big bolt and number,
two tiles ("High score", "Comics read"), "This week" strip, the month grid, "How
it works" (three short lines).

**Back issues.** Back button and title; rows with paper cover, date, "Issue N",
"N comics". Empty: Robo, "NO BACK ISSUES YET", one line.

**States.** Loading: skeleton cards with a slow shimmer. Building: a line "Robo is
still drawing N comics." and placeholders. Empty section: Robo and "Nothing here
today". Offline: a banner, cached issue stays. Error: Robo glitching, "CAN'T
REACH THE PRINTER", "Try again".

## 5. Motion

Springs: bouncy (damping 12, stiffness 180) for arrivals; snappy (damping 18,
stiffness 260) for presses; fades 0.2 s.

- **Launch** (about 1.4 s): grid fades in, wordmark flickers on like a tube, Robo
  drops in and blinks, the dock button slides up.
- **Card to Reader.** The card's paper cover lifts, grows and lands as panel 1
  (shared element, about 0.45 s, bouncy); the rest of the Reader fades in behind;
  the caption fades in under it last. Closing from panel 1 flies it back. If a
  shared transition is unreliable, fall back to scale 0.94 to 1 plus fade.
- **Panel swipe.** Paged; the outgoing sheet tilts 2 degrees and sinks slightly;
  pips slide. Light haptic per page.
- **Picture arrival.** Crayon scribble placeholder wobbles; the picture fades in
  with a brief backlight pulse.
- **Reaction tap.** Tile dips and springs back; the count ticks; the icon hops.
- **Draw a fresh one.** Button text becomes "Robo is on it" with three pulsing
  dots; a dashed-border card appears at the top ("Sharpening crayons", "1 of 4
  panels"); when ready the border turns solid and a volt "NEW" badge pops in.
  On failure the button shakes and a toast explains.
- **Celebration timeline.** 0.0 s dim and Robo pops in; 0.3 s "DAY CLEARED"
  slams down with a small screen shake; 0.6 s the number counts up from the old
  value; 0.9 s confetti burst (about 40 small rectangles in the five neon
  colours); 1.2 s today's week cell fills; 1.6 s speech bubble; 2.0 s button. A
  tap before the end skips to the resting state.
- **Reduce Motion:** no shake, no confetti, no flight; everything becomes a 0.2 s
  fade. Honour it everywhere.

## 6. Robo

Drawn in code with `react-native-svg` on a 100 x 100 grid, never a bitmap. Boxy
head with a dark screen face (two cyan eyes, a small smile), one antenna with a
yellow ball, round ear caps, squat body with three chest lights (pink, yellow,
green), stubby arms and feet, a white outline sticker edge. Poses: idle (blinks
every few seconds, antenna sways), cheer (arms up, eyes as happy arcs), drawing
(holds a crayon, eyes down), sleepy (half-closed eyes, for a combo at risk),
glitch (eyes as crosses, slight jitter, for errors). Robo is the mascot of the
habit; do not make it resemble any existing app's mascot.

## 7. Copy

| Where | Text |
| --- | --- |
| Issue tag | ISSUE {n} |
| Dock button | Draw a fresh one / Robo is on it |
| Drawing card | Sharpening crayons |
| Building line | Robo is still drawing {n} comics. |
| Footer | That's the whole issue. Go outside. |
| Real story heading | THE REAL STORY |
| Celebration | DAY CLEARED / day combo / Keep reading |
| First day bubble | That's day one. Come back tomorrow and it becomes a combo. |
| Later days bubble | {n} days. The crayons are warm. |
| Combo sheet | Your combo / High score / Comics read / This week / How it works |
| Sheet status | Today's cleared. Come back tomorrow for {n+1}. / Read one comic to clear today. |
| At risk banner | Your {n}-day combo ends at midnight. One comic saves it. |
| Combo ended | Combo over at {n}. High score {best}. New game? |
| Back issues | Back issues / NO BACK ISSUES YET / Issue {n} is today's. Come back tomorrow and it'll be here. |
| Older issue | Today's issue isn't out yet. Here's issue {n}. |
| Draw failures | No fresh stories right now. / Robo is out of crayons for today. / Robo is already drawing one. / My crayon snapped. Try again. |
| Offline | You're offline. Showing the last issue. |
| Error | CAN'T REACH THE PRINTER / Try again |

Voice: short, dry, kind. Arcade words for the habit (combo, high score, new
game), newspaper words for the content (issue, back issues).

## 8. Accessibility

- Every panel image's label is its scene text; captions are real text.
- VoiceOver order follows reading order; the celebration is modal.
- Reaction buttons announce name, count and selected state.
- Touch targets 44 pt or more; nothing depends on colour alone (tags carry text,
  cleared days carry a bolt).
- Increase Contrast turns glows off and borders to full opacity.
