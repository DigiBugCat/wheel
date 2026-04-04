class_name SpinResultGenerator extends Control

#Buttons and Text
@onready var SELECTIONBOX = %SelectedResult
@onready var IMPORTBUTTON = %ImportButton
@onready var UPDATEBUTTON = %UpdateButton
@onready var DELETEBUTTON = %DeleteButton
@onready var TEXTBOX = %ResultTextEdit

#Previews
@onready var VIDEOPLAYER = %VideoPlayer
@onready var AUDIOPLAYER = %AudioPlayer
@onready var SPRITE = %Sprite

#For Video Greenscreening:
#For hiding/enabling
@onready var GREENSCREEN_CONTAINER = %ColorSelectionContainer
@onready var ENABLE_GREENSCREEN_BUTTON = %EnableGreenscreenButton
#Selecting colors
@onready var COLOR_BUTTON = %SelectColorButton
@onready var COLOR_PREVIEW = %ColorPreview
@onready var COLOR_TEXT = %ColorText
#Adjusting values of greenscreening
@onready var RANGE_SPINBOX = %RangeSpinBox
@onready var RANGE_SLIDER = %RangeSlider
@onready var FADE_SPINBOX = %FadeSpinBox
@onready var FADE_SLIDER = %FadeSlider

#Result filepath
const filepath = "res://Output/results.json"

#Used for export keyss
const FILETYPE = "filetype"
const FILEPATH = "filepath"
const FILEEXT = "fileext"
const TEXT = "text"
const IMAGE = "img"
const VIDEO = "vid"
const AUDIO = "aud"
#Used for Video Greenscreening
const COLOR = "chromacolor"
const PICKUP = "pickuprange"
const FADE = "fadeamount"
const NOGREENSCREEN = Color.TRANSPARENT
const DEFAULTGREENSCREENVALUE = 0.1

#Used for shaders
const CHROMA_COLOR = "shader_parameter/chroma_key_color"
const PICKUP_RANGE = "shader_parameter/pickup_range"
const FADE_AMOUNT =  "shader_parameter/fade_amount"


const CREATING = 0

const QUOTE = '"'
const SPACE = 32

var file_dialog
var confirmation_dialog

var color_picker := false

var spin_results = []

func _ready() -> void:
	import_results()
	IMPORTBUTTON.pressed.connect(create_file_explorer)
	UPDATEBUTTON.pressed.connect(update_selection)
	DELETEBUTTON.pressed.connect(delete_selection)
	SELECTIONBOX.item_selected.connect(change_selection)
	TEXTBOX.text_changed.connect(remove_quote)
	
	COLOR_BUTTON.pressed.connect(enable_color_selector)
	COLOR_TEXT.text_changed.connect(set_color_text)
	
	SELECTIONBOX.select(CREATING)
	
	ENABLE_GREENSCREEN_BUTTON.toggled.connect(toggle_greenscreen_options)
	
	RANGE_SPINBOX.value_changed.connect(update_range)
	RANGE_SLIDER.value_changed.connect(update_range)
	FADE_SPINBOX.value_changed.connect(update_fade)
	FADE_SLIDER.value_changed.connect(update_fade)
	
func _input(event: InputEvent) -> void:
	if (!color_picker):
		return
		
	if (event is InputEventMouseButton && event.is_pressed() && event.get_button_index() == MOUSE_BUTTON_LEFT):
		#This is probably a crippling mistake! I've discovered there's a ColorPickerNode...AFTER I made this!
		var img = get_viewport().get_texture().get_image()
		var selected_color = img.get_pixelv(event.global_position)
		set_color(selected_color)
		color_picker = false

func toggle_greenscreen_options(toggled):
	var offset_result = SELECTIONBOX.get_selected_id() - 1
	if (toggled == false):
		spin_results[offset_result][COLOR] = NOGREENSCREEN
	
	COLOR_BUTTON.set_disabled(!toggled)
	COLOR_TEXT.set_editable(toggled)
	RANGE_SPINBOX.set_editable(toggled)
	RANGE_SLIDER.set_editable(toggled)
	FADE_SPINBOX.set_editable(toggled)
	FADE_SLIDER.set_editable(toggled)
	
	export_result(false)
	
func set_color(selected_color):
	var offset_result = SELECTIONBOX.get_selected_id() - 1
	
	COLOR_PREVIEW.set_color(selected_color)
	COLOR_TEXT.set_text(selected_color.to_html())
	VIDEOPLAYER.material.set(CHROMA_COLOR, selected_color)
	
	spin_results[offset_result][COLOR] = selected_color
	export_result(false)
	
func remove_quote():
	var new_text = TEXTBOX.get_text()
	new_text = new_text.remove_char(QUOTE.unicode_at(0))
	
func set_color_text():
	var new_text = COLOR_TEXT.get_text()
	if (new_text.is_valid_html_color()):
		var new_color = Color(new_text)
		set_color(new_color)
		
func enable_color_selector():
	color_picker = true
	
func update_range(new_range):
	var offset_result = SELECTIONBOX.get_selected_id() - 1
	
	VIDEOPLAYER.material.set(PICKUP_RANGE, new_range)
	RANGE_SPINBOX.set_value_no_signal(new_range)
	RANGE_SLIDER.set_value_no_signal(new_range)
	
	spin_results[offset_result][PICKUP] = new_range
	
	export_result(false)
	
func update_fade(new_fade):
	var offset_result = SELECTIONBOX.get_selected_id() - 1
	
	VIDEOPLAYER.material.set(FADE_AMOUNT, new_fade)
	FADE_SPINBOX.set_value_no_signal(new_fade)
	FADE_SLIDER.set_value_no_signal(new_fade)
	
	spin_results[offset_result][FADE] = new_fade
	
	export_result(false)
	
### Change Selection
func change_selection(selected_option):
	GREENSCREEN_CONTAINER.hide()
	VIDEOPLAYER.hide()
	VIDEOPLAYER.stop()
	AUDIOPLAYER.stop()
	SPRITE.hide()
	
	if (selected_option == CREATING):
		TEXTBOX.clear()
		return
		
	var offset_result = selected_option - 1
	var selected_file_data = spin_results[offset_result]
	var selected_filetype = selected_file_data[FILETYPE]
		
	if (selected_filetype == VIDEO):
		VIDEOPLAYER.load_video_preview(selected_file_data)
		show_greenscreen(offset_result)
	elif (selected_filetype == AUDIO):
		AUDIOPLAYER.load_audio_preview(selected_file_data)
	elif (selected_filetype == IMAGE):
		SPRITE.load_sprite_preview(selected_file_data)
	else:
		return
	
	TEXTBOX.set_text(spin_results[offset_result][TEXT])
	
func show_greenscreen(offset_result):
	var greenscreen_color = parse_color_vector_string(spin_results[offset_result][COLOR])
	var greenscreen_pickup = spin_results[offset_result][PICKUP]
	var greenscreen_fade = spin_results[offset_result][FADE]
	
	if (greenscreen_color == NOGREENSCREEN):
		ENABLE_GREENSCREEN_BUTTON.set_pressed_no_signal(false)
		toggle_greenscreen_options(false)
		greenscreen_color = Color.TRANSPARENT
	else:
		ENABLE_GREENSCREEN_BUTTON.set_pressed_no_signal(true)
		toggle_greenscreen_options(true)
		

	COLOR_PREVIEW.set_color(greenscreen_color)
	COLOR_TEXT.set_text(greenscreen_color.to_html())
	
	RANGE_SPINBOX.set_value_no_signal(greenscreen_pickup)
	RANGE_SLIDER.set_value_no_signal(greenscreen_pickup)
	FADE_SPINBOX.set_value_no_signal(greenscreen_fade)
	FADE_SLIDER.set_value_no_signal(greenscreen_fade)
	
	GREENSCREEN_CONTAINER.show()
	
### Update a result's text. You would import if you want to update what loads in.
func update_selection():
	var selected_id = SELECTIONBOX.get_selected_id()
	if (selected_id == CREATING || TEXTBOX.get_text().is_empty()):
		return
	else:
		var offset_id = selected_id - 1
		spin_results[offset_id][TEXT] = TEXTBOX.get_text()
		
	export_result(true, selected_id)
	
### Deletion for a result
func delete_selection():
	if (SELECTIONBOX.get_selected_id() == CREATING):
		return
	
	confirmation_dialog = ConfirmationDialog.new()
	confirmation_dialog.set_title("Confirmation")
	confirmation_dialog.set_text("Are you sure you want to delete this result? It cannot be undone!")
	confirmation_dialog.canceled.connect(delete_confirmation_popup)
	confirmation_dialog.confirmed.connect(delete_selection_confirmed)
	
	add_child(confirmation_dialog)
	
	confirmation_dialog.popup_centered()
	
func delete_selection_confirmed():
	var selected_id = SELECTIONBOX.get_selected_id()
	if (selected_id == CREATING):
		return
	else:
		selected_id = selected_id - 1
		spin_results.remove_at(selected_id)
	
	export_result()
	delete_confirmation_popup()
	
	TEXTBOX.clear()
	SELECTIONBOX.select(CREATING)
	SELECTIONBOX.item_selected.emit(CREATING)
	
func delete_confirmation_popup():
	if (confirmation_dialog != null):
		confirmation_dialog.queue_free()
	
###File I/O, used for creating/updating a new result
func create_file_explorer(file_mode = FileDialog.FILE_MODE_OPEN_FILE, access = FileDialog.ACCESS_FILESYSTEM, rect_size = Rect2(0,0, 700, 500), title = ""):
	#Only one file dialog is allowed at a time.
	var result_text = TEXTBOX.get_text()
	
	if (file_dialog != null || result_text.is_empty()):
		return
	
	file_dialog = FileDialog.new()
	file_dialog.set_use_native_dialog(true)
	file_dialog.set_title(title)
	file_dialog.set_access(access)
	file_dialog.set_file_mode(file_mode)
	file_dialog.set_meta("_created_by", self)
	
	file_dialog.file_selected.connect(import_result)
	file_dialog.canceled.connect(delete_explorer)
	
	var viewport = get_viewport()
	viewport.add_child(file_dialog)
	
	file_dialog.popup(rect_size)

#There's nothing stopping you from having multiple items with the same text.
func import_result(load_filepath):
	var result_text = TEXTBOX.get_text()
	var selected_id = SELECTIONBOX.get_selected_id()
	var succeeded = load_data_wrapper(load_filepath, selected_id, result_text)
	delete_explorer()
	
	if (succeeded):
		export_result(true, selected_id)
	
func load_data_wrapper(load_filepath, selected_id, result_text):
	var file_ext = load_filepath.get_extension().to_lower()
	var localized_filepath = ProjectSettings.localize_path(load_filepath)
	var file_result = null
	#Assuming you input a valid file.
	if (file_ext == "ogv"): 
		#Just rename ogg videos as ogv if needed. Yes, Godot's Video Player implementation is very narrow.
		#For now, this is used for web, so I can't include ffmpeg to read other video filetypes.
		#If I export this to C#/Mono, THEN I could do that. But for Godot 4, for now, that's not an option.
		file_result = VIDEOPLAYER.load_video(localized_filepath, file_ext, result_text)
	elif (file_ext == "ogg" || file_ext == "mp3" || file_ext == "wav"):
		file_result = AUDIOPLAYER.load_audio(localized_filepath, file_ext, result_text)
	else:
		file_result = SPRITE.load_sprite(localized_filepath, file_ext, result_text)
		
	if (file_result != null):
		if (selected_id == CREATING):
			spin_results.append(file_result)
		else:
			var offset_result = selected_id - 1
			spin_results[offset_result] = file_result
			SELECTIONBOX.item_selected.emit(selected_id)
		return true
		
	return false
	
func delete_explorer():
	if (file_dialog != null):
		file_dialog.queue_free()

### File I/O for the Results
func import_results():
	var file = FileAccess.open(filepath, FileAccess.READ)
	var json = JSON.new()
	
	if (json.parse(file.get_as_text()) != OK):
		return
		
	spin_results = json.data
	export_result()

func export_result(update = true, selected_value = -1):
	var json_export_data = JSON.stringify(spin_results)
	var file =  FileAccess.open(filepath, FileAccess.WRITE)
	file.flush() #Flush for safety.
	file.store_string(json_export_data)
	file.close()
	
	if (selected_value == -1):
		selected_value = 0
	
	if (update):
		SELECTIONBOX.reload_results(spin_results)
		SELECTIONBOX.select(selected_value)

static func parse_color_vector_string(color_string):
	if (color_string is Color):
		return color_string
		
	var output_color = Color.TRANSPARENT
	var formatted_color_string = color_string.trim_prefix('(').trim_suffix(')')
	formatted_color_string.remove_char(SPACE)
	var color_values = formatted_color_string.split_floats(",")
	
	output_color = Color(color_values[0], color_values[1], color_values[2], color_values[3])
	
	return output_color
