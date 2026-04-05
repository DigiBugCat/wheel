class_name EffectDecider extends Control

@onready var MAINPARENTNODE = $"../.."

@onready var AUDIOPLAYER = %AudioPlayer
@onready var ANIMATEDSPRITE = %AnimatedSprite2D
@onready var VIDEOPLAYER = %VideoStreamPlayer
@onready var TEXTLABEL = %RichTextLabel
@onready var LABELPANEL = %LabelPanel
@onready var GETAUDIOPLAYER = %DefaultGetPlayer
@onready var SPRITE = %TextureRect #Has a placeholder texture - Used for audio.
#Yes, I could just combine audio and sprite, but I didn't. I did not think this through, you see.
@onready var WHEEL = %WheelRect
@onready var WHEEL_TIMER = %StopTimer

@onready var TEXT_TIMER = %TextTimer
@onready var DELAY_TIMER = %DelayTimer
@onready var SPRITE_TIMER = %SpriteDisplayTimer

@onready var GREENSCREEN_SHADER = preload("res://Assets/Shader/GreenScreenShader.gdshader")

const FILEPATH = "res://Output/results.json"

const TEXT_TIME = 4.0 #How long the text should be displayed
const DELAY_TIME = 2.0 #How long the delay should be
const SPRITE_DISPLAY_TIME = 5.0 #How long the Sprite should be displayed

var wheel_result : int
var spin_results : Array

var video_stream
var file_type

var spin
var video_shader_material = null

var file_path
var asset_loaded := false

func _ready() -> void:
	WHEEL_TIMER.timeout.connect(roll_result)
	load_json_results()
	wheel_result = randi_range(0, spin_results.size() - 1)
	prepare_result(wheel_result)
	
func _process(_delta: float) -> void:
	if (!asset_loaded && ResourceLoader.load_threaded_get_status(file_path) == 1.0):
		load_result()
		asset_loaded = true
	
func roll_result():
	WHEEL.hide()
	
	if (!asset_loaded):
		#This should never happen, but if it did, your file is probably too big.
		#Or your computer is VERY slow.
		load_result()
		asset_loaded = true
		
	play_text()
	
func play_result():
	if (file_type == SpinResultGenerator.VIDEO):
		play_video()
	if (file_type == SpinResultGenerator.AUDIO):
		play_audio()
	if (file_type == SpinResultGenerator.IMAGE):
		play_image()
	#Not implemented.
	#if (file_type == "ANIMATION"):
	#	pass
	#if (file_type == "OVERLAY"):
	#	pass
		
func play_text():
	TEXT_TIMER.start(TEXT_TIME)
	TEXT_TIMER.timeout.connect(hide_text)
	LABELPANEL.show()
	TEXTLABEL.show()
	GETAUDIOPLAYER.play()
	
	DELAY_TIMER.start()
	DELAY_TIMER.timeout.connect(play_result)
	
func hide_text():
	TEXTLABEL.hide()
	LABELPANEL.hide()
	
func play_video():
	VIDEOPLAYER.set_material(video_shader_material)
	
	VIDEOPLAYER.set_stream(video_stream)
	VIDEOPLAYER.show()
	VIDEOPLAYER.play()
	VIDEOPLAYER.finished.connect(delete_self)
	
func play_audio():
	SPRITE.show()
	AUDIOPLAYER.play()
	AUDIOPLAYER.finished.connect(delete_self)

func play_image():
	SPRITE.show()
	SPRITE_TIMER.start(SPRITE_DISPLAY_TIME)
	SPRITE_TIMER.timeout.connect(delete_self)
	
func load_json_results():
	var file = FileAccess.open(FILEPATH, FileAccess.READ)
	var json = JSON.new()
	
	if (json.parse(file.get_as_text()) != OK):
		return
		
	spin_results = json.data
	
#This actually LOADS the result pre-emptively. It should run while the wheel spins.
func prepare_result(wheel_result_id):
	spin = spin_results[wheel_result_id]
	file_type = spin[SpinResultGenerator.FILETYPE]
	file_path = spin[SpinResultGenerator.FILEPATH]
	
	var formatted_text = "[wave][rainbow]" + spin[SpinResultGenerator.TEXT] + "[/rainbow][/wave]"
	TEXTLABEL.set_text(formatted_text)
	
	if(file_type == SpinResultGenerator.VIDEO):
		load_video()
	if(file_type == SpinResultGenerator.AUDIO):
		load_audio()
	if(file_type == SpinResultGenerator.IMAGE):
		load_sprite()
		
func load_result():
	if(file_type == SpinResultGenerator.VIDEO):
		video_loaded()
	if(file_type == SpinResultGenerator.AUDIO):
		audio_loaded()
	if(file_type == SpinResultGenerator.IMAGE):
		sprite_loaded()
		
	
#An optimization I could (And should) make: Separate loading the resouce and actually 
func load_video():
	ResourceLoader.load_threaded_request(file_path)
	
func video_loaded():
	var video_filepath = ResourceLoader.load_threaded_get(file_path)
	var color = SpinResultGenerator.parse_color_vector_string(spin[SpinResultGenerator.COLOR])
	video_stream = video_filepath
	
	video_shader_material = ShaderMaterial.new()
	video_shader_material.set_shader(GREENSCREEN_SHADER)
	video_shader_material.set(SpinResultGenerator.CHROMA_COLOR, color)
	video_shader_material.set(SpinResultGenerator.PICKUP_RANGE, spin[SpinResultGenerator.PICKUP])
	video_shader_material.set(SpinResultGenerator.FADE_AMOUNT, spin[SpinResultGenerator.FADE])
	
func load_audio():
	ResourceLoader.load_threaded_request(file_path)
	
func audio_loaded():
	var audio_filepath = ResourceLoader.load_threaded_get(file_path)
	var file_audio_stream = audio_filepath
	AUDIOPLAYER.set_stream(file_audio_stream)
	
func load_sprite():
	ResourceLoader.load_threaded_request(file_path)
	
func sprite_loaded():
	var img = ResourceLoader.load_threaded_get(file_path)
	SPRITE.set_texture(img)

func delete_self():
	MAINPARENTNODE.queue_free()
