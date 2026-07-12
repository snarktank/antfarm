extends Object

const PetStats = preload("res://scripts/pet_stats.gd")
const PetInteractions = preload("res://scripts/interactions.gd")
const PetHUD = preload("res://scripts/hud.gd")

func test_bars_update_from_stats_snapshot() -> Variant:
	var hud := PetHUD.new()

	var stats := PetStats.new()
	stats.hunger = 60.0
	stats.happiness = 70.0
	stats.energy = 40.0
	stats.cleanliness = 90.0
	var interactions := PetInteractions.new()
	hud.update_display(stats, interactions, 0.0)

	if hud.bar_hunger.value != 60.0:
		hud.free()
		return "bar_hunger.value expected 60.0, got " + str(hud.bar_hunger.value)
	if hud.bar_happiness.value != 70.0:
		hud.free()
		return "bar_happiness.value expected 70.0"
	if hud.bar_energy.value != 40.0:
		hud.free()
		return "bar_energy.value expected 40.0"
	if hud.bar_cleanliness.value != 90.0:
		hud.free()
		return "bar_cleanliness.value expected 90.0"

	hud.free()
	return true

func test_button_disabled_while_on_cooldown() -> Variant:
	var hud := PetHUD.new()
	var stats := PetStats.new()
	var interactions := PetInteractions.new()

	# Trigger feed (COOLDOWN_FEED = 5.0s) — still on cooldown 1s later
	interactions.perform("feed", stats, 1000.0)
	hud.update_display(stats, interactions, 1001.0)

	var feed_disabled: bool = hud.btn_feed.disabled
	hud.free()

	if not feed_disabled:
		return "btn_feed should be disabled 1s after use (cooldown 5s)"
	return true

func test_button_enabled_after_cooldown_expires() -> Variant:
	var hud := PetHUD.new()
	var stats := PetStats.new()
	var interactions := PetInteractions.new()

	# Trigger feed, check 10s later (cooldown 5s, so expired)
	interactions.perform("feed", stats, 1000.0)
	hud.update_display(stats, interactions, 1010.0)

	var feed_enabled: bool = not hud.btn_feed.disabled
	hud.free()

	if not feed_enabled:
		return "btn_feed should be enabled 10s after use (cooldown 5s)"
	return true

func test_all_five_buttons_exist_with_min_touch_size() -> Variant:
	var hud := PetHUD.new()

	if hud.btn_feed == null or hud.btn_feed.custom_minimum_size.x < 96:
		hud.free()
		return "btn_feed missing or min_size < 96"
	if hud.btn_play == null or hud.btn_play.custom_minimum_size.x < 96:
		hud.free()
		return "btn_play missing or min_size < 96"
	if hud.btn_pet == null or hud.btn_pet.custom_minimum_size.x < 96:
		hud.free()
		return "btn_pet missing or min_size < 96"
	if hud.btn_clean == null or hud.btn_clean.custom_minimum_size.x < 96:
		hud.free()
		return "btn_clean missing or min_size < 96"
	if hud.btn_sleep == null or hud.btn_sleep.custom_minimum_size.x < 96:
		hud.free()
		return "btn_sleep missing or min_size < 96"

	hud.free()
	return true

func test_action_signals_defined_on_hud() -> Variant:
	var hud := PetHUD.new()

	var all_ok: bool = (
		hud.has_signal("action_feed") and
		hud.has_signal("action_play") and
		hud.has_signal("action_pet") and
		hud.has_signal("action_clean") and
		hud.has_signal("action_sleep")
	)

	hud.free()

	if not all_ok:
		return "Not all action signals are defined on PetHUD"
	return true
