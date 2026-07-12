class_name PetInteractions
extends RefCounted

const PetStats = preload("res://scripts/pet_stats.gd")

# Stat deltas applied per action
const FEED_HUNGER: float = 25.0
const PLAY_HAPPINESS: float = 20.0
const PLAY_ENERGY_COST: float = 10.0
const PET_HAPPINESS: float = 15.0
const CLEAN_CLEANLINESS: float = 30.0
const SLEEP_ENERGY: float = 40.0

# Cooldowns in seconds
const COOLDOWN_FEED: float = 5.0
const COOLDOWN_PLAY: float = 10.0
const COOLDOWN_PET: float = 3.0
const COOLDOWN_CLEAN: float = 8.0
const COOLDOWN_SLEEP: float = 30.0

const VALID_ACTIONS: Array[String] = ["feed", "play", "pet", "clean", "sleep"]

var _last_used: Dictionary = {}  # action -> last used time (float seconds)

func _get_cooldown(action: String) -> float:
	match action:
		"feed":   return COOLDOWN_FEED
		"play":   return COOLDOWN_PLAY
		"pet":    return COOLDOWN_PET
		"clean":  return COOLDOWN_CLEAN
		"sleep":  return COOLDOWN_SLEEP
		_:        return 0.0

func can_perform(action: String, now: float) -> bool:
	if action not in VALID_ACTIONS:
		return false
	var last: float = _last_used.get(action, -INF)
	return (now - last) >= _get_cooldown(action)

func remaining_cooldown(action: String, now: float) -> float:
	var last: float = _last_used.get(action, -INF)
	var elapsed: float = now - last
	return maxf(0.0, _get_cooldown(action) - elapsed)

func perform(action: String, stats: PetStats, now: float) -> bool:
	if not can_perform(action, now):
		return false
	_last_used[action] = now
	match action:
		"feed":
			stats.hunger = clampf(stats.hunger + FEED_HUNGER, 0.0, 100.0)
		"play":
			stats.happiness = clampf(stats.happiness + PLAY_HAPPINESS, 0.0, 100.0)
			stats.energy = clampf(stats.energy - PLAY_ENERGY_COST, 0.0, 100.0)
		"pet":
			stats.happiness = clampf(stats.happiness + PET_HAPPINESS, 0.0, 100.0)
		"clean":
			stats.cleanliness = clampf(stats.cleanliness + CLEAN_CLEANLINESS, 0.0, 100.0)
		"sleep":
			stats.energy = clampf(stats.energy + SLEEP_ENERGY, 0.0, 100.0)
		_:
			return false
	return true
