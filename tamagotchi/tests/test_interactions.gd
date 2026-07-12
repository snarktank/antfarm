extends Object

const PetStats = preload("res://scripts/pet_stats.gd")
const PetInteractions = preload("res://scripts/interactions.gd")

func test_feed_increases_hunger() -> Variant:
	var stats := PetStats.new()
	stats.hunger = 50.0
	var pi := PetInteractions.new()
	var ok := pi.perform("feed", stats, 1000.0)
	if not ok:
		return "feed should succeed on first call"
	if stats.hunger <= 50.0:
		return "hunger should increase after feed, got %s" % stats.hunger
	return true

func test_play_increases_happiness_costs_energy() -> Variant:
	var stats := PetStats.new()
	stats.happiness = 50.0
	stats.energy = 50.0
	var pi := PetInteractions.new()
	var ok := pi.perform("play", stats, 1000.0)
	if not ok:
		return "play should succeed on first call"
	if stats.happiness <= 50.0:
		return "happiness should increase after play, got %s" % stats.happiness
	if stats.energy >= 50.0:
		return "energy should decrease after play, got %s" % stats.energy
	return true

func test_pet_increases_happiness() -> Variant:
	var stats := PetStats.new()
	stats.happiness = 50.0
	var pi := PetInteractions.new()
	var ok := pi.perform("pet", stats, 1000.0)
	if not ok:
		return "pet should succeed on first call"
	if stats.happiness <= 50.0:
		return "happiness should increase after pet, got %s" % stats.happiness
	return true

func test_clean_increases_cleanliness() -> Variant:
	var stats := PetStats.new()
	stats.cleanliness = 50.0
	var pi := PetInteractions.new()
	var ok := pi.perform("clean", stats, 1000.0)
	if not ok:
		return "clean should succeed on first call"
	if stats.cleanliness <= 50.0:
		return "cleanliness should increase after clean, got %s" % stats.cleanliness
	return true

func test_sleep_increases_energy() -> Variant:
	var stats := PetStats.new()
	stats.energy = 50.0
	var pi := PetInteractions.new()
	var ok := pi.perform("sleep", stats, 1000.0)
	if not ok:
		return "sleep should succeed on first call"
	if stats.energy <= 50.0:
		return "energy should increase after sleep, got %s" % stats.energy
	return true

func test_stats_clamp_at_100() -> Variant:
	var stats := PetStats.new()
	stats.hunger = 95.0
	stats.happiness = 95.0
	stats.energy = 95.0
	stats.cleanliness = 95.0
	var pi := PetInteractions.new()
	pi.perform("feed", stats, 1000.0)
	if stats.hunger > 100.0:
		return "hunger must not exceed 100, got %s" % stats.hunger
	pi.perform("pet", stats, 1000.0)
	if stats.happiness > 100.0:
		return "happiness must not exceed 100, got %s" % stats.happiness
	pi.perform("sleep", stats, 1000.0)
	if stats.energy > 100.0:
		return "energy must not exceed 100, got %s" % stats.energy
	pi.perform("clean", stats, 1000.0)
	if stats.cleanliness > 100.0:
		return "cleanliness must not exceed 100, got %s" % stats.cleanliness
	return true

func test_cooldown_rejects_second_call() -> Variant:
	var stats := PetStats.new()
	stats.hunger = 50.0
	var pi := PetInteractions.new()
	pi.perform("feed", stats, 1000.0)
	var hunger_after_first: float = stats.hunger
	var ok2 := pi.perform("feed", stats, 1000.1)
	if ok2:
		return "second feed within cooldown should be rejected"
	if stats.hunger != hunger_after_first:
		return "stats must not change when action rejected by cooldown"
	return true

func test_cooldown_rejects_play_within_window() -> Variant:
	var stats := PetStats.new()
	stats.happiness = 50.0
	stats.energy = 50.0
	var pi := PetInteractions.new()
	pi.perform("play", stats, 2000.0)
	var happiness_snap: float = stats.happiness
	var ok := pi.perform("play", stats, 2001.0)
	if ok:
		return "play within cooldown should be rejected"
	if stats.happiness != happiness_snap:
		return "happiness changed during cooldown rejection"
	return true

func test_action_succeeds_after_cooldown_elapses() -> Variant:
	var stats := PetStats.new()
	stats.hunger = 30.0
	var pi := PetInteractions.new()
	pi.perform("feed", stats, 1000.0)
	var ok2 := pi.perform("feed", stats, 1000.0 + PetInteractions.COOLDOWN_FEED + 0.1)
	if not ok2:
		return "feed should succeed after cooldown elapses"
	return true

func test_can_perform_false_during_cooldown() -> Variant:
	var stats := PetStats.new()
	var pi := PetInteractions.new()
	pi.perform("play", stats, 2000.0)
	if pi.can_perform("play", 2001.0):
		return "can_perform should be false during cooldown"
	return true

func test_can_perform_true_after_cooldown() -> Variant:
	var stats := PetStats.new()
	var pi := PetInteractions.new()
	pi.perform("play", stats, 2000.0)
	if not pi.can_perform("play", 2000.0 + PetInteractions.COOLDOWN_PLAY + 1.0):
		return "can_perform should be true after cooldown expires"
	return true

func test_remaining_cooldown_decreases() -> Variant:
	var stats := PetStats.new()
	var pi := PetInteractions.new()
	pi.perform("feed", stats, 5000.0)
	var rem: float = pi.remaining_cooldown("feed", 5002.0)
	var expected: float = PetInteractions.COOLDOWN_FEED - 2.0
	if absf(rem - expected) > 0.01:
		return "remaining cooldown should be ~%s, got %s" % [expected, rem]
	return true

func test_play_energy_floor() -> Variant:
	var stats := PetStats.new()
	stats.energy = 5.0
	var pi := PetInteractions.new()
	pi.perform("play", stats, 1000.0)
	if stats.energy < 0.0:
		return "energy must not go below 0 after play"
	return true
