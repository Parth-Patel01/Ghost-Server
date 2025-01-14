#!/bin/bash

# 1. Update and Upgrade System Packages
update_system() {
    echo "Updating system packages..."
    sudo apt update && sudo apt upgrade -y
}

# 2. Install Necessary Dependencies
install_dependencies() {
    echo "Installing dependencies..."
    sudo apt install -y apt-transport-https ca-certificates curl gnupg2 software-properties-common python3 python3-pip python3-venv ufw
}

# 3. Install Jellyfin Repository and Configure Firewall
install_jellyfin() {
    echo "Installing Jellyfin..."
    curl https://repo.jellyfin.org/install-debuntu.sh | sudo bash
    sudo ufw allow 8096/tcp
}

# 4. Create Media Directory
setup_media_directory() {
    echo "Setting up media directory..."
    mkdir -p ~/media/Movies
}

# 5. Setup Project Directory Structure
setup_project_directory() {
    echo "Setting up project directory..."
    mkdir -p ~/Project/movie-upload
    mkdir -p ~/Project/movie-upload/templates
    mkdir -p ~/Project/movie-upload/static
}

# 6. Create and Activate Virtual Environment
setup_virtualenv() {
    echo "Setting up Python virtual environment..."
    cd ~/Project/movie-upload
    python3 -m venv venv
    source venv/bin/activate
    pip install Flask gunicorn
}

# 7. Create Flask App (app.py)
create_flask_app() {
    echo "Creating Flask app..."
    cat <<EOF > ~/Project/movie-upload/app.py
from flask import Flask, request, jsonify, render_template
import os
import subprocess

app = Flask(__name__)

# Path to the movies folder
UPLOAD_FOLDER = '/media/Movies'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 4 * 1024 * 1024 * 1024

# Allowed file extensions
ALLOWED_EXTENSIONS = {'mp4', 'mkv', 'avi', 'mov'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/uploadMovies', methods=['POST'])
def upload_movies():
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file part'})

    file = request.files['file']
    if file and allowed_file(file.filename):
        filename = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        file.save(filename)
        subprocess.run(["/home/ghost/Project/movie-upload/sync_library.sh"])
        return jsonify({'success': True, 'message': f'File {file.filename} uploaded successfully!'})
    else:
        return jsonify({'success': False, 'message': 'Invalid file type. Only .mp4, .mkv, .avi, .mov files are allowed.'})

@app.route('/manageMovies')
def manage_movies():
    files = []
    for file in os.listdir(UPLOAD_FOLDER):
        if file.endswith(('.mp4', '.mkv', '.avi')):
            files.append(file)
    return render_template('manage_movies.html', files=files)

@app.route('/deleteFile', methods=['POST'])
def delete_file():
    file_name = request.form['fileName']
    video_file_path = os.path.join(UPLOAD_FOLDER, file_name)
    
    if os.path.exists(video_file_path):
        os.remove(video_file_path)
        subprocess.run(["/home/ghost/Project/movie-upload/sync_library.sh"])
        return jsonify({"success": True, "message": f"{file_name} deleted successfully."})
    else:
        return jsonify({"success": False, "message": "File not found."})

@app.route('/renameFile', methods=['POST'])
def rename_file():
    old_name = request.form['oldName']
    new_name = request.form['newName']
    old_path = os.path.join(UPLOAD_FOLDER, old_name)
    new_path = os.path.join(UPLOAD_FOLDER, new_name)
    if os.path.exists(old_path):
        os.rename(old_path, new_path)
        return jsonify({"success": True, "message": f"{old_name} renamed to {new_name}."})
    else:
        return jsonify({"success": False, "message": "File not found."})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
EOF
}

# 8. Create Sync Library Script
create_sync_script() {
    echo "Creating sync library script..."
    cat <<EOF > ~/Project/movie-upload/sync_library.sh
#!/bin/bash

# Define Jellyfin URL and API key
JELLYFIN_URL="http://192.168.18.12:8096"
API_KEY="ad14af14e128497bb3385bcd3414d582"  # Replace with your actual Jellyfin API key

# Send the refresh request to Jellyfin API
curl -X POST "\$JELLYFIN_URL/emby/Library/Refresh?api_key=\$API_KEY"
EOF
    chmod +x ~/Project/movie-upload/sync_library.sh
}

# 9. Create HTML Templates
create_html_templates() {
    echo "Creating HTML templates..."
    cat <<EOL > ~/Project/movie-upload/templates/index.html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Movie Upload</title>
    <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
    <div class="container">
        <h1>Upload Your Movie</h1>
        <form id="uploadForm" enctype="multipart/form-data" method="post">
            <label for="file" class="file-label">Choose Movie File:</label>
            <input type="file" name="file" id="file" accept=".mp4, .mkv, .avi, .mov" required>
            <button type="submit" class="upload-btn">Upload</button>
        </form>

        <div id="uploadStatus" class="status"></div>

        <div id="progressWrapper" class="progress-wrapper" style="display: none;">
            <label for="progressBar">Upload Progress:</label>
            <progress id="progressBar" value="0" max="100"></progress>
        </div>

        <div id="message" class="message"></div>
    </div>

    <script>
        const uploadForm = document.getElementById("uploadForm");
        const fileInput = document.getElementById("file");
        const uploadStatus = document.getElementById("uploadStatus");
        const progressWrapper = document.getElementById("progressWrapper");
        const progressBar = document.getElementById("progressBar");
        const messageDiv = document.getElementById("message");

        uploadForm.addEventListener("submit", function(event) {
            event.preventDefault();
            const formData = new FormData();
            formData.append("file", fileInput.files[0]);

            uploadStatus.textContent = "Uploading...";
            progressWrapper.style.display = "block";

            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/uploadMovies", true);

            xhr.upload.addEventListener("progress", function(event) {
                if (event.lengthComputable) {
                    const percent = (event.loaded / event.total) * 100;
                    progressBar.value = percent;
                }
            });

            xhr.onload = function() {
                if (xhr.status === 200) {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        uploadStatus.textContent = \`File \${fileInput.files[0].name} uploaded successfully!\`;
                        messageDiv.textContent = "File uploaded and processed.";
                    } else {
                        uploadStatus.textContent = response.message;
                    }
                } else {
                    uploadStatus.textContent = "Error uploading file.";
                }
                progressWrapper.style.display = "none";
            };

            xhr.onerror = function() {
                uploadStatus.textContent = "Network error. Please try again.";
                progressWrapper.style.display = "none";
            };

            xhr.send(formData);
        });
    </script>
</body>
</html>
EOL
}

create_manage_movies_html() {
    echo "Creating manage movies template..."
    cat <<EOL > ~/Project/movie-upload/templates/manage_movies.html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Manage Movies</title>
    <link rel="stylesheet" href="{{ url_for('static', filename='styles.css') }}">
</head>
<body>
    <div class="container">
        <h1>Manage Movies</h1>
        <table>
            <thead>
                <tr>
                    <th>File Name</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
                {% for file in files %}
                    <tr>
                        <td>{{ file }}</td>
                        <td>
                            <form action="/deleteFile" method="POST" style="display:inline;">
                                <input type="hidden" name="fileName" value="{{ file }}">
                                <button type="submit">Delete</button>
                            </form>
                            <form action="/renameFile" method="POST" style="display:inline;">
                                <input type="hidden" name="oldName" value="{{ file }}">
                                <input type="text" name="newName" placeholder="New name">
                                <button type="submit">Rename</button>
                            </form>
                        </td>
                    </tr>
                {% endfor %}
            </tbody>
        </table>
    </div>
</body>
</html>
EOL
}

create_styles_css() {
    echo "Creating styles.css file..."

# Create the styles.css file inside the static folder and add the CSS code
    cat <<EOL > ~/Project/movie-upload/static/styles.css
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    font-family: 'Arial', sans-serif;
}

body {
    background-color: #f4f7fc;
    color: #333;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    padding: 20px;
}

.container {
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    padding: 30px;
    width: 100%;
    max-width: 600px;
    text-align: center;
}

h1 {
    font-size: 2rem;
    color: #4caf50;
    margin-bottom: 20px;
    text-transform: uppercase;
}

label {
    display: block;
    font-size: 1rem;
    color: #555; 
    margin-bottom: 10px;
    text-align: left;
}

input[type="file"] {
    display: block;
    margin: 0 auto 20px;
    padding: 10px;
    font-size: 1rem;
    color: #333;
    border: 2px solid #ddd;
    border-radius: 4px;
    width: 100%;
    cursor: pointer;
    background-color: #f9f9f9;
}

input[type="file"]:hover {
    border-color: #4caf50;
}

.upload-btn {
    background-color: #4caf50;
    color: white;
    border: none;
    padding: 12px 24px;
    font-size: 1rem;
    cursor: pointer;
    border-radius: 4px;
    width: 100%;
    transition: background-color 0.3s;
}

.upload-btn:hover {
    background-color: #45a049;
}

.status {
    font-size: 1rem;
    color: #333;
    margin-top: 20px;
    font-weight: bold;
}

.progress-wrapper {
    margin-top: 20px;
}

progress {
    width: 100%;
    height: 20px;
    border-radius: 10px;
    appearance: none;
}

progress::-webkit-progress-bar {
    background-color: #f3f3f3;
    border-radius: 10px;
}

progress::-webkit-progress-value {
    background-color: #4caf50;
    border-radius: 10px;
}

#message {
    font-size: 1rem;
    margin-top: 20px;
    color: #333;
    font-weight: normal;
}

@media (max-width: 768px) {
    .container {
        padding: 20px;
        width: 90%;
    }

    h1 {
        font-size: 1.5rem;
    }

    .upload-btn {
        font-size: 0.9rem;
    }

    input[type="file"] {
        font-size: 0.9rem;
    }
}
EOL
}

# 10. Set Up Gunicorn and Systemd Service
setup_gunicorn_and_service() {
    echo "Setting up Gunicorn and systemd service..."
    cat <<EOF > ~/Project/movie-upload/movie-upload-app-gunicorn.service
[Unit]
Description=Gunicorn instance to serve Flask Application
After=network.target

[Service]
User=ghost
Group=ghost
WorkingDirectory=/home/ghost/Project/movie-upload
ExecStart=/home/ghost/Project/movie-upload/venv/bin/gunicorn --workers 4 --timeout 3600 --bind 0.0.0.0:5000 app:app

[Install]
WantedBy=multi-user.target
EOF

    sudo mv ~/Project/movie-upload/movie-upload-app-gunicorn.service /etc/systemd/system/
    sudo systemctl enable movie-upload-app-gunicorn
    sudo systemctl start movie-upload-app-gunicorn
}

# Execute All Steps
update_system
install_dependencies
install_jellyfin
setup_media_directory
setup_project_directory
setup_virtualenv
create_flask_app
create_sync_script
create_html_templates
create_manage_movies_html
create_styles_css
setup_gunicorn_and_service

echo "Movie upload app setup complete!"
