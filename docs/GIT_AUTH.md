# Git Authentication Setup for NanoClaw

## Option 1: SSH Key (Recommended)

### Step 1: Generate SSH Key (if not already done)

```bash
ssh-keygen -t ed25519 -C "nanoclaw@huwe-0306" -f ~/.ssh/nanoclaw_github_key -N ""
```

### Step 2: Add Public Key to GitHub

1. Copy the public key:

   ```bash
   cat ~/.ssh/nanoclaw_github_key.pub
   ```

2. Go to GitHub → Settings → SSH and GPG keys → New SSH key
3. Paste the public key and save

### Step 3: Mount Key When Starting Container

The nanoclaw container needs access to your private SSH key. You have two options:

#### Option A: Store in NanoClaw's data directory (convenient)

```bash
# Copy the key to NanoClaw's store
cp ~/.ssh/nanoclaw_github_key ~/.local/share/nanoclaw/store/ssh/id_rsa

# The container will automatically mount this if it exists
```

#### Option B: Use environment variable (more secure)

When starting nanoclaw, set:

```bash
export NANOClaw_SSH_KEY="your_private_ssh_key_content_here"
```

### Step 4: Configure Git User in Container

The container already has Git configured with:

- `user.email`: nanoclaw@huwe-0306
- `user.name`: NanoClaw

You can customize this in `CLAUDE.md` for each group if needed.

### Step 5: Test Git Access

In your Discord channel, ask the agent to test:

```
@Nanoclaw run: cd /workspace/inventory-system && git remote -v
```

## Option 2: Personal Access Token (PAT)

If you prefer tokens over SSH:

### Step 1: Create PAT on GitHub

1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Generate new token with `repo` scope
3. Copy the token

### Step 2: Configure Git to Use Token

In your group's `CLAUDE.md`, add:

```markdown
## Git Configuration

When pushing to GitHub, use your personal access token (PAT) instead of password.
The token should have `repo` scope for full access.
```

Then the agent can use:

```bash
git remote set-url origin https://<token>@github.com/username/repo.git
```

## Troubleshooting

### Permission denied (publickey)

- Make sure the SSH key is mounted correctly
- Check `~/.ssh/known_hosts` contains GitHub's host keys (already included)
- Test manually: `ssh -T git@github.com`

### Git asks for password

- Use SSH URL format: `git@github.com:username/repo.git`
- Not HTTPS: `https://github.com/username/repo.git`

### Host key verification failed

- The `known_hosts` file should already contain GitHub's keys
- If missing, run: `ssh-keyscan github.com >> ~/.ssh/known_hosts`
