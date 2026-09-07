/*
 * EDIT THIS FILE FIRST.
 *
 * It contains all of the game settings that a beginner is likely to change.
 * The two words in each challenge must be valid DoodleNet / Quick, Draw! labels.
 */
window.GAME_CONFIG = {
  modelName: "DoodleNet",
  roundSeconds: 25,
  totalRounds: 5,
  brushWidth: 18,

  // DoodleNet works best with a centered square image.
  modelInputSize: 280,
  modelDrawingSize: 224,

  // Set this to true while developing. Turn it off before the Club Expo.
  debug: true,

  challenges: [
    ["cat", "dog"],
    ["dog", "cat"],
    ["apple", "balloon"],
    ["fish", "airplane"],
    ["flower", "sun"],
    ["cup", "bucket"],
    ["bicycle", "eyeglasses"],
    ["umbrella", "mushroom"],
    ["house", "television"],
    ["tree", "broccoli"],
    ["airplane", "bird"],
    ["rabbit", "cat"]
  ]
};
