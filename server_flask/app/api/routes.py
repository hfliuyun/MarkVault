
import os
import frontmatter
import markdown
from flask import current_app, jsonify, request
from . import api_bp
from app.services.content_index import ContentIndex, ContentIndexError
from app.services.media import send_post_image
from utils.renderMarkdown import render_markdown_to_html
from utils.saveUtils import save_image, save_post



POSTS_DIR = 'posts'
_content_index = None


def get_content_index():
    global _content_index
    content_root = current_app.config["CONTENT_ROOT"]
    if _content_index is None or _content_index.content_root != content_root:
        _content_index = ContentIndex(content_root)
    else:
        _content_index.reload_if_changed()
    return _content_index


def content_error_response(error):
    return jsonify({"error": "Content index error", "detail": str(error)}), 500

def get_all_posts_metadata():
    posts = []
    if not os.path.exists(POSTS_DIR):
        return posts
    for filename in os.listdir(POSTS_DIR):
        if filename.endswith('.md'):
            filepath = os.path.join(POSTS_DIR, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                try:
                    post_frontmatter = frontmatter.load(f)
                    post_metadata = { 'slug': os.path.splitext(filename)[0] }
                    post_metadata.update(post_frontmatter.metadata)
                    posts.append(post_metadata)
                except Exception as e:
                    print(f"Error parsing {filename}: {e}")
    return posts

def get_post_by_slug(slug):
    post_path = os.path.join(POSTS_DIR, f"{slug}.md")
    if not os.path.exists(post_path):
        return None
    
    with open(post_path, 'r', encoding='utf-8') as f:
        try:
            post_frontmatter = frontmatter.load(f)
            post = { 'slug': slug }
            post.update(post_frontmatter.metadata)
            post['content'] = markdown.markdown(post_frontmatter.content)
            return post
        except Exception as e:
            print(f"Error parsing {slug}.md: {e}")
            return None

def get_raw_post_by_abbrlink(abbrlink):
    all_posts_metadata = get_all_posts_metadata()
    post_metadata = next((p for p in all_posts_metadata if p.get('abbrlink') == abbrlink), None)
    if not post_metadata:
        return None
    
    slug = post_metadata.get('slug')
    post_path = os.path.join(POSTS_DIR, f"{slug}.md")
    if not os.path.exists(post_path):
        return None
        
    with open(post_path, 'r', encoding='utf-8') as f:
        return f.read()

@api_bp.route('/posts_list_metadata', methods=['GET'])
def get_all_posts():
    try:
        page = int(request.args.get('page', 1))
        size = int(request.args.get('size', 10))
    except (ValueError, TypeError):
        page = 1
        size = 10

    all_posts = get_all_posts_metadata()
    
    all_posts.sort(key=lambda x: str(x.get('date', '')), reverse=True)
    
    total_posts = len(all_posts)
    
    start_index = (page - 1) * size
    end_index = start_index + size
    
    paginated_posts = all_posts[start_index:end_index]
    
    response = {
        'total': total_posts,
        'page': page,
        'size': len(paginated_posts),
        'articles': paginated_posts
    }
    return jsonify(response)


@api_bp.route('/posts/<slug>', methods=['GET'])
def get_post(slug):
    try:
        post = get_content_index().get_post(slug)
    except ContentIndexError as error:
        return content_error_response(error)

    if not post:
        return jsonify({'error': 'Post not found'}), 404
    return jsonify(post.to_dict())


@api_bp.route('/posts', methods=['GET'])
def get_posts():
    try:
        page = int(request.args.get('page', 1))
        size = int(request.args.get('size', request.args.get('page_size', 10)))
    except (ValueError, TypeError):
        page = 1
        size = 10

    try:
        return jsonify(get_content_index().list_posts(page=page, size=size))
    except ContentIndexError as error:
        return content_error_response(error)


@api_bp.route('/series', methods=['GET'])
def get_series_list():
    try:
        return jsonify(get_content_index().list_series())
    except ContentIndexError as error:
        return content_error_response(error)


@api_bp.route('/series/<series_id>', methods=['GET'])
def get_series_detail(series_id):
    try:
        series = get_content_index().get_series(series_id)
    except ContentIndexError as error:
        return content_error_response(error)

    if not series:
        return jsonify({'error': 'Series not found'}), 404
    return jsonify(series)


@api_bp.route('/categories', methods=['GET'])
def get_categories():
    try:
        return jsonify(get_content_index().list_categories())
    except ContentIndexError as error:
        return content_error_response(error)


@api_bp.route('/tags', methods=['GET'])
def get_tags():
    try:
        return jsonify(get_content_index().list_tags())
    except ContentIndexError as error:
        return content_error_response(error)


@api_bp.route('/media/posts/<slug>/images/<path:filename>', methods=['GET'])
def get_post_media(slug, filename):
    try:
        image_dir = get_content_index().get_post_image_dir(slug)
    except ContentIndexError as error:
        return content_error_response(error)
    return send_post_image(image_dir, filename)

@api_bp.route('/p/<string:abbrlink>', methods=['GET'])
def get_post_by_abbrlink_route(abbrlink):
    raw_content = get_raw_post_by_abbrlink(abbrlink)
    if raw_content is not None:
        post_frontmatter = frontmatter.loads(raw_content)
        response = dict(post_frontmatter.metadata)
        #print(response)
        response['content'] = render_markdown_to_html(post_frontmatter.content)
        return jsonify(response)
    else:
        return jsonify({'error': 'Post not found'}), 404

@api_bp.route('/md/<string:abbrlink>', methods=['GET'])
def get_mdpost_by_abbrlink_route(abbrlink):
    raw_content = get_raw_post_by_abbrlink(abbrlink)
    if raw_content is not None:
        post_frontmatter = frontmatter.loads(raw_content)
        response = dict(post_frontmatter.metadata)
        response['content'] = post_frontmatter.content
        return jsonify(response)
    else:
        return jsonify({'error': 'Post not found'}), 404

@api_bp.route('/upload_image', methods=['POST'])
def upload_image():
    if 'image' not in request.files:
        return jsonify({'error': 'No image file provided'}), 400
    
    image_file = request.files['image']
    
    image_url, error = save_image(image_file)
    
    if error:
        return jsonify({'error': error}), 400
        
    return jsonify({'url': image_url})

@api_bp.route('/save_post', methods=['POST'])
def save_post_route():
    post_data = request.get_json()
    if not post_data:
        return jsonify({'error': 'No post data provided'}), 400
        
    post_path, error = save_post(post_data)
    
    if error:
        return jsonify({'error': error}), 400
        
    return jsonify({'message': f'Post saved to {post_path}'})
