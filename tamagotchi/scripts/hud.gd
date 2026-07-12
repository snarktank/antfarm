class_name PetHUD
extends Control

const PetStats = preload("res://scripts/pet_stats.gd")
const PetInteractions = preload("res://scripts/interactions.gd")

signal action_feed
signal action_play
signal action_pet
signal action_clean
signal action_sleep

var bar_hunger: ProgressBar
var bar_happiness: ProgressBar
var bar_energy: ProgressBar
var bar_cleanliness: ProgressBar

var btn_feed: Button
var btn_play: Button
var btn_pet: Button
var btn_clean: Button
var btn_sleep: Button

const MIN_BTN_SIZE: int = 96

func _init() -> void:
	_build_stats_area()
	_build_buttons_area()

func _build_stats_area() -> void:
	var box := VBoxContainer.new()
	box.name = "Stats"
	box.anchor_right = 1.0
	box.offset_top = 10.0
	box.offset_bottom = 350.0
	box.offset_left = 10.0
	box.offset_right = -10.0
	add_child(box)

	bar_hunger = _make_bar(box, "HungerRow", "Hunger")
	bar_happiness = _make_bar(box, "HappinessRow", "Happy")
	bar_energy = _make_bar(box, "EnergyRow", "Energy")
	bar_cleanliness = _make_bar(box, "CleanlinessRow", "Clean")

func _build_buttons_area() -> void:
	var box := HBoxContainer.new()
	box.name = "Buttons"
	box.anchor_top = 1.0
	box.anchor_right = 1.0
	box.anchor_bottom = 1.0
	box.offset_top = -160.0
	box.offset_left = 10.0
	box.offset_right = -10.0
	box.offset_bottom = -10.0
	add_child(box)

	btn_feed = _make_button(box, "BtnFeed", "Feed")
	btn_play = _make_button(box, "BtnPlay", "Play")
	btn_pet = _make_button(box, "BtnPet", "Pet")
	btn_clean = _make_button(box, "BtnClean", "Clean")
	btn_sleep = _make_button(box, "BtnSleep", "Sleep")

	btn_feed.pressed.connect(func(): action_feed.emit())
	btn_play.pressed.connect(func(): action_play.emit())
	btn_pet.pressed.connect(func(): action_pet.emit())
	btn_clean.pressed.connect(func(): action_clean.emit())
	btn_sleep.pressed.connect(func(): action_sleep.emit())

func _make_bar(parent: VBoxContainer, row_name: String, label_text: String) -> ProgressBar:
	var row := HBoxContainer.new()
	row.name = row_name
	parent.add_child(row)

	var lbl := Label.new()
	lbl.text = label_text
	lbl.custom_minimum_size = Vector2(80, 0)
	row.add_child(lbl)

	var bar := ProgressBar.new()
	bar.name = "Bar"
	bar.min_value = 0.0
	bar.max_value = 100.0
	bar.value = 80.0
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(bar)
	return bar

func _make_button(parent: HBoxContainer, btn_name: String, label_text: String) -> Button:
	var btn := Button.new()
	btn.name = btn_name
	btn.text = label_text
	btn.custom_minimum_size = Vector2(MIN_BTN_SIZE, MIN_BTN_SIZE)
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(btn)
	return btn

func update_display(stats: PetStats, interactions: PetInteractions, now: float) -> void:
	bar_hunger.value = stats.hunger
	bar_happiness.value = stats.happiness
	bar_energy.value = stats.energy
	bar_cleanliness.value = stats.cleanliness

	btn_feed.disabled = not interactions.can_perform("feed", now)
	btn_play.disabled = not interactions.can_perform("play", now)
	btn_pet.disabled = not interactions.can_perform("pet", now)
	btn_clean.disabled = not interactions.can_perform("clean", now)
	btn_sleep.disabled = not interactions.can_perform("sleep", now)
