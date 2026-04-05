class_name WheelSpin2D extends Sprite2D

@onready var SOUNDPLAYER = %WheelSound
@onready var STARTTIMER = %WheelTimer
@onready var SLOWTIMER = %SlowTimer
@onready var STOPTIMER = %StopTimer

const SPEED = "shader_parameter/speed"
const MAX_TIME = "shader_parameter/max_time"
const BASE_TEXTURE = "shader_parameter/base_texture"

const START_SPIN_TIME := 1.7
const SLOW_SPIN_TIME := 0.8
const STOP_SPIN_TIME := 0.5
const SPIN_MIN := 5
const SPIN_MAX := 8

var spin_amount
var last_angle
var rotation_speed : float

###Close enough. I SHOULD just make/use a video, but eh.

func  _ready() -> void:
	spin_amount = randi_range(SPIN_MIN, SPIN_MAX)
	rotation_speed = spin_amount / START_SPIN_TIME
	material.set(BASE_TEXTURE, texture)
	material.set(SPEED, rotation_speed)
	material.set(MAX_TIME, 3.0)
	
	SOUNDPLAYER.play()
	
	STARTTIMER.timeout.connect(start_slowdown)
	STARTTIMER.start(START_SPIN_TIME)
	
func start_slowdown():
	SLOWTIMER.start(SLOW_SPIN_TIME)
	SLOWTIMER.timeout.connect(start_stop)
	
func start_stop():
	STOPTIMER.start(STOP_SPIN_TIME)
