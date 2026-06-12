import os
import uuid
import frontmatter
import random
from datetime import datetime
from flask import url_for

POSTS_DIR = 'posts'
IMAGE_DIR = 'static/image'

#
def generate_abbrlink(title):
    """Generate a unique abbreviation link for a post.
      取title的hash值作为缩略链接，确保唯一性。

    Args:
        title (str): The title of the post.
    """
    return str(hash(title))[:9]



def save_image(image_file):
    if not image_file:
        return None, "No image file provided"
    
    # Create a unique filename
    filename = str(uuid.uuid4()) + os.path.splitext(image_file.filename)[1]
    
    # Ensure the image directory exists
    if not os.path.exists(IMAGE_DIR):
        os.makedirs(IMAGE_DIR)
        
    image_path = os.path.join(IMAGE_DIR, filename)
    image_file.save(image_path)
    
    # Generate the image URL
    # Note: This requires the application context to be available
    image_url = url_for('static', filename=f'image/{filename}', _external=True)
    
    return image_url, None

def save_post(post_data):
    title = post_data.get('title')
    if not title:
        return None, "Post title is required"
    
    # Create a slug from the title for the filename
    slug = title.lower().replace(' ', '-') + '.md'
    post_path = os.path.join(POSTS_DIR, slug)
    
    # Check if a post with the same title already exists
    #存在了保存到相同的文件中
    if os.path.exists(post_path):
        return
        
        
    # Prepare metadata, providing defaults for date and abbrlink
    metadata = {
        'title': title,
        'date': post_data.get('date') or datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'categories': post_data.get('categories', []),
        'tags': post_data.get('tags', []),
        'abbrlink': post_data.get('abbrlink') or generate_abbrlink(title),
    }
    
    content = post_data.get('content', '')
    
    # Create a frontmatter Post object
    post = frontmatter.Post(content, **metadata)
    
    # Save the post to a .md file
    with open(post_path, 'w', encoding='utf-8') as f:
        f.write(frontmatter.dumps(post))
        
    return post_path, None