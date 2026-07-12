extends Node2D

const PetStats = preload("res://scripts/pet_stats.gd")
const SaveSystem = preload("res://scripts/save_system.gd")
const PetInteractions = preload("res://scripts/interactions.gd")
const CreatureStateMachine = preload("res://scripts/creature_state_machine.gd")
const PlaceholderFrames = preload("res://scripts/placeholder_frames.gd")
const PetHUD = preload("res://scripts/hud.gd")

const AUTOSAVE_INTERVAL: float = 30.0

var stats: PetStats
var save_sys: SaveSystem
var interactions: PetInteractions
var state_machine: CreatureStateMachine
var hud: PetHUD
var sprite: AnimatedSprite2D

var _autosave_timer: float = 0.0

func _ready() -> void:
	get_tree().set_auto_accept_quit(false)

	save_sys = SaveSystem.new()
	stats = save_sys.load()
	interactions = PetInteractions.new()
	state_machine = CreatureStateMachine.new()

	# Creature sprite — centred in portrait layout
	sprite = AnimatedSprite2D.new()
	sprite.name = "CreatureSprite"
	sprite.sprite_frames = PlaceholderFrames.build()
	sprite.position = Vector2(360, 500)
	sprite.scale = Vector2(3.0, 3.0)
	sprite.play("idle")
	add_child(sprite)

	# HUD in a CanvasLayer so it always renders on top at native resolution
	var canvas_layer := CanvasLayer.new()
	canvas_layer.name = "UILayer"
	add_child(canvas_layer)

	hud = PetHUD.new()
	hud.name = "HUD"
	hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	canvas_layer.add_child(hud)

	hud.action_feed.connect(_on_feed)
	hud.action_play.connect(_on_play)
	hud.action_pet.connect(_on_pet)
	hud.action_clean.connect(_on_clean)
	hud.action_sleep.connect(_on_sleep)

	_refresh_hud()

func _process(delta: float) -> void:
	var now := Time.get_unix_time_from_system()
	stats.apply_decay(delta)

	var anim := state_machine.animation_name(stats, now)
	if sprite.animation != anim:
		sprite.play(anim)

	_autosave_timer += delta
	if _autosave_timer >= AUTOSAVE_INTERVAL:
		_autosave_timer = 0.0
		save_sys.save(stats)

	_refresh_hud()

func _notification(what: int) -> void:
	match what:
		NOTIFICATION_WM_CLOSE_REQUEST, NOTIFICATION_APPLICATION_FOCUS_OUT:
			save_sys.save(stats)
			if what == NOTIFICATION_WM_CLOSE_REQUEST:
				get_tree().quit()

func _refresh_hud() -> void:
	var now := Time.get_unix_time_from_system()
	hud.update_display(stats, interactions, now)

func _on_feed() -> void:
	var now := Time.get_unix_time_from_system()
	if interactions.perform("feed", stats, now):
		state_machine.trigger_action("feed", now)
		_refresh_hud()

func _on_play() -> void:
	var now := Time.get_unix_time_from_system()
	if interactions.perform("play", stats, now):
		state_machine.trigger_action("play", now)
		_refresh_hud()

func _on_pet() -> void:
	var now := Time.get_unix_time_from_system()
	if interactions.perform("pet", stats, now):
		_refresh_hud()

func _on_clean() -> void:
	var now := Time.get_unix_time_from_system()
	if interactions.perform("clean", stats, now):
		_refresh_hud()

func _on_sleep() -> void:
	var now := Time.get_unix_time_from_system()
	if interactions.perform("sleep", stats, now):
		state_machine.set_sleeping(true)
		_refresh_hud()
