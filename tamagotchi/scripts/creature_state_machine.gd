class_name CreatureStateMachine
extends RefCounted

const PetStats = preload("res://scripts/pet_stats.gd")

enum State { IDLE, HAPPY, SAD, SLEEPING, EATING, PLAYING }

# Stat thresholds
const CRITICAL_LOW: float = 25.0   # below this -> SAD
const HIGH_THRESHOLD: float = 70.0 # all above this -> HAPPY

# How long transient action states (eating/playing) persist
const TRANSIENT_DURATION: float = 2.0

# Animation names — must match SpriteFrames from placeholder_frames.gd
const ANIM_IDLE     := "idle"
const ANIM_HAPPY    := "happy"
const ANIM_SAD      := "sad"
const ANIM_SLEEPING := "sleeping"
const ANIM_EATING   := "eating"
const ANIM_PLAYING  := "playing"

var _asleep: bool = false
var _transient_state: int = State.IDLE  # EATING or PLAYING when active
var _transient_until: float = -1.0      # timestamp when transient expires

func set_sleeping(asleep: bool) -> void:
	_asleep = asleep
	if asleep:
		# Cancel any transient action so sleep takes priority
		_transient_until = -1.0

func trigger_action(action: String, now: float) -> void:
	match action:
		"feed":
			_transient_state = State.EATING
			_transient_until = now + TRANSIENT_DURATION
		"play":
			_transient_state = State.PLAYING
			_transient_until = now + TRANSIENT_DURATION

func resolve(stats: PetStats, now: float) -> int:
	if _asleep:
		return State.SLEEPING
	if _transient_until > now:
		return _transient_state
	if _is_any_stat_critical(stats):
		return State.SAD
	if _all_stats_high(stats):
		return State.HAPPY
	return State.IDLE

func animation_name(stats: PetStats, now: float) -> String:
	match resolve(stats, now):
		State.IDLE:     return ANIM_IDLE
		State.HAPPY:    return ANIM_HAPPY
		State.SAD:      return ANIM_SAD
		State.SLEEPING: return ANIM_SLEEPING
		State.EATING:   return ANIM_EATING
		State.PLAYING:  return ANIM_PLAYING
		_:              return ANIM_IDLE

func _is_any_stat_critical(stats: PetStats) -> bool:
	return (
		stats.hunger < CRITICAL_LOW or
		stats.happiness < CRITICAL_LOW or
		stats.energy < CRITICAL_LOW or
		stats.cleanliness < CRITICAL_LOW
	)

func _all_stats_high(stats: PetStats) -> bool:
	return (
		stats.hunger >= HIGH_THRESHOLD and
		stats.happiness >= HIGH_THRESHOLD and
		stats.energy >= HIGH_THRESHOLD and
		stats.cleanliness >= HIGH_THRESHOLD
	)
