extends Object

const PetStats = preload("res://scripts/pet_stats.gd")
const CreatureStateMachine = preload("res://scripts/creature_state_machine.gd")

func _make_high_stats() -> PetStats:
	var s := PetStats.new()
	s.hunger = 90.0
	s.happiness = 90.0
	s.energy = 90.0
	s.cleanliness = 90.0
	return s

func _make_low_hunger_stats() -> PetStats:
	var s := PetStats.new()
	s.hunger = 10.0
	s.happiness = 80.0
	s.energy = 80.0
	s.cleanliness = 80.0
	return s

func test_default_is_idle() -> Variant:
	var sm := CreatureStateMachine.new()
	var stats := PetStats.new()
	stats.hunger = 50.0
	stats.happiness = 50.0
	stats.energy = 50.0
	stats.cleanliness = 50.0
	var state: int = sm.resolve(stats, 1000.0)
	if state != CreatureStateMachine.State.IDLE:
		return "Expected IDLE, got " + str(state)
	var anim: String = sm.animation_name(stats, 1000.0)
	if anim != "idle":
		return "Expected 'idle' animation, got: " + anim
	return true

func test_sleep_flag_gives_sleeping() -> Variant:
	var sm := CreatureStateMachine.new()
	var stats := PetStats.new()
	sm.set_sleeping(true)
	var state: int = sm.resolve(stats, 1000.0)
	if state != CreatureStateMachine.State.SLEEPING:
		return "Expected SLEEPING, got " + str(state)
	var anim: String = sm.animation_name(stats, 1000.0)
	if anim != "sleeping":
		return "Expected 'sleeping' animation, got: " + anim
	return true

func test_sleep_flag_cleared_stops_sleeping() -> Variant:
	var sm := CreatureStateMachine.new()
	var stats := PetStats.new()
	stats.hunger = 50.0
	stats.happiness = 50.0
	stats.energy = 50.0
	stats.cleanliness = 50.0
	sm.set_sleeping(true)
	sm.set_sleeping(false)
	var state: int = sm.resolve(stats, 1000.0)
	if state == CreatureStateMachine.State.SLEEPING:
		return "Expected non-SLEEPING after clearing flag"
	return true

func test_critically_low_hunger_gives_sad() -> Variant:
	var sm := CreatureStateMachine.new()
	var stats := _make_low_hunger_stats()
	var state: int = sm.resolve(stats, 1000.0)
	if state != CreatureStateMachine.State.SAD:
		return "Expected SAD with low hunger, got " + str(state)
	var anim: String = sm.animation_name(stats, 1000.0)
	if anim != "sad":
		return "Expected 'sad' animation, got: " + anim
	return true

func test_all_high_stats_gives_happy() -> Variant:
	var sm := CreatureStateMachine.new()
	var stats := _make_high_stats()
	var state: int = sm.resolve(stats, 1000.0)
	if state != CreatureStateMachine.State.HAPPY:
		return "Expected HAPPY with all-high stats, got " + str(state)
	var anim: String = sm.animation_name(stats, 1000.0)
	if anim != "happy":
		return "Expected 'happy' animation, got: " + anim
	return true

func test_feed_triggers_eating_transient() -> Variant:
	var sm := CreatureStateMachine.new()
	var stats := _make_high_stats()
	sm.trigger_action("feed", 1000.0)
	var state: int = sm.resolve(stats, 1000.5)
	if state != CreatureStateMachine.State.EATING:
		return "Expected EATING during transient, got " + str(state)
	var anim: String = sm.animation_name(stats, 1000.5)
	if anim != "eating":
		return "Expected 'eating' animation, got: " + anim
	return true

func test_eating_transient_reverts_after_duration() -> Variant:
	var sm := CreatureStateMachine.new()
	var stats := _make_high_stats()
	sm.trigger_action("feed", 1000.0)
	var state: int = sm.resolve(stats, 1003.0)
	if state == CreatureStateMachine.State.EATING:
		return "Expected state to revert from EATING after duration"
	return true

func test_play_triggers_playing_transient() -> Variant:
	var sm := CreatureStateMachine.new()
	var stats := _make_high_stats()
	sm.trigger_action("play", 1000.0)
	var state: int = sm.resolve(stats, 1000.5)
	if state != CreatureStateMachine.State.PLAYING:
		return "Expected PLAYING during transient, got " + str(state)
	var anim: String = sm.animation_name(stats, 1000.5)
	if anim != "playing":
		return "Expected 'playing' animation, got: " + anim
	return true

func test_playing_transient_reverts_after_duration() -> Variant:
	var sm := CreatureStateMachine.new()
	var stats := _make_high_stats()
	sm.trigger_action("play", 1000.0)
	var state: int = sm.resolve(stats, 1003.0)
	if state == CreatureStateMachine.State.PLAYING:
		return "Expected state to revert from PLAYING after duration"
	return true

func test_sleeping_overrides_transient() -> Variant:
	var sm := CreatureStateMachine.new()
	var stats := _make_high_stats()
	sm.trigger_action("feed", 1000.0)
	sm.set_sleeping(true)
	var state: int = sm.resolve(stats, 1000.5)
	if state != CreatureStateMachine.State.SLEEPING:
		return "Expected SLEEPING to override EATING transient, got " + str(state)
	return true

func test_sleeping_overrides_sad() -> Variant:
	var sm := CreatureStateMachine.new()
	var stats := _make_low_hunger_stats()
	sm.set_sleeping(true)
	var state: int = sm.resolve(stats, 1000.0)
	if state != CreatureStateMachine.State.SLEEPING:
		return "Expected SLEEPING to override SAD, got " + str(state)
	return true

func test_animation_names_match_sprite_frames() -> Variant:
	var expected := ["idle", "happy", "sad", "sleeping", "eating", "playing"]
	var sm := CreatureStateMachine.new()
	if sm.ANIM_IDLE not in expected:
		return "ANIM_IDLE not in expected set"
	if sm.ANIM_HAPPY not in expected:
		return "ANIM_HAPPY not in expected set"
	if sm.ANIM_SAD not in expected:
		return "ANIM_SAD not in expected set"
	if sm.ANIM_SLEEPING not in expected:
		return "ANIM_SLEEPING not in expected set"
	if sm.ANIM_EATING not in expected:
		return "ANIM_EATING not in expected set"
	if sm.ANIM_PLAYING not in expected:
		return "ANIM_PLAYING not in expected set"
	return true
