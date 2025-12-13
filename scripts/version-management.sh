#!/bin/bash
# Script สำหรับจัดการเวอร์ชั่นและการ Rollback
# Usage: ./scripts/version-management.sh [command] [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
print_help() {
    echo "Usage: ./scripts/version-management.sh [command] [options]"
    echo ""
    echo "Commands:"
    echo "  tag-version <version> <message>  - สร้าง tag สำหรับเวอร์ชั่น (เช่น v1.0.0)"
    echo "  list-tags                         - ดู tags ทั้งหมด"
    echo "  list-commits                      - ดู commit history"
    echo "  create-staging                    - สร้าง staging branch"
    echo "  rollback-to <tag/commit>          - Rollback ไปใช้ tag หรือ commit เก่า"
    echo "  show-version                      - แสดงเวอร์ชั่นปัจจุบัน"
    echo ""
    echo "Examples:"
    echo "  ./scripts/version-management.sh tag-version v1.0.0 'Version 1.0.0 Stable'"
    echo "  ./scripts/version-management.sh rollback-to v1.0.0"
    echo "  ./scripts/version-management.sh create-staging"
}

tag_version() {
    local version=$1
    local message=$2
    
    if [ -z "$version" ]; then
        echo -e "${RED}Error: ต้องระบุ version${NC}"
        echo "Usage: tag-version <version> <message>"
        exit 1
    fi
    
    if [ -z "$message" ]; then
        message="Version $version"
    fi
    
    echo -e "${YELLOW}Creating tag: $version${NC}"
    git tag -a "$version" -m "$message"
    git push origin "$version"
    echo -e "${GREEN}✓ Tag $version created and pushed${NC}"
}

list_tags() {
    echo -e "${YELLOW}Available tags:${NC}"
    git tag -l -n9
    echo ""
    echo -e "${YELLOW}Latest 5 tags:${NC}"
    git tag -l | tail -5
}

list_commits() {
    echo -e "${YELLOW}Recent commits:${NC}"
    git log --oneline --graph --all -20
}

create_staging() {
    echo -e "${YELLOW}Creating staging branch...${NC}"
    git checkout -b staging 2>/dev/null || git checkout staging
    git push origin staging
    echo -e "${GREEN}✓ Staging branch created/updated${NC}"
    echo -e "${YELLOW}Current branch: $(git branch --show-current)${NC}"
}

rollback_to() {
    local target=$1
    
    if [ -z "$target" ]; then
        echo -e "${RED}Error: ต้องระบุ tag หรือ commit hash${NC}"
        echo "Usage: rollback-to <tag/commit>"
        exit 1
    fi
    
    echo -e "${YELLOW}Rolling back to: $target${NC}"
    
    # Check if it's a tag or commit
    if git rev-parse "$target" >/dev/null 2>&1; then
        echo -e "${YELLOW}Creating rollback branch...${NC}"
        branch_name="rollback-$(date +%Y%m%d-%H%M%S)"
        git checkout -b "$branch_name" "$target"
        echo -e "${GREEN}✓ Rollback branch created: $branch_name${NC}"
        echo -e "${YELLOW}To deploy this version:${NC}"
        echo "  1. git push origin $branch_name"
        echo "  2. In Northflank: Change source branch to $branch_name"
        echo "  3. Or merge to main: git checkout main && git merge $branch_name"
    else
        echo -e "${RED}Error: $target ไม่พบใน Git history${NC}"
        exit 1
    fi
}

show_version() {
    echo -e "${YELLOW}Current Git Information:${NC}"
    echo "Branch: $(git branch --show-current)"
    echo "Commit: $(git rev-parse --short HEAD)"
    echo "Latest Tag: $(git describe --tags --abbrev=0 2>/dev/null || echo 'No tags')"
    echo ""
    echo -e "${YELLOW}Recent tags:${NC}"
    git tag -l | tail -5
}

# Main command handler
case "$1" in
    tag-version)
        tag_version "$2" "$3"
        ;;
    list-tags)
        list_tags
        ;;
    list-commits)
        list_commits
        ;;
    create-staging)
        create_staging
        ;;
    rollback-to)
        rollback_to "$2"
        ;;
    show-version)
        show_version
        ;;
    help|--help|-h)
        print_help
        ;;
    *)
        echo -e "${RED}Error: คำสั่งไม่ถูกต้อง${NC}"
        echo ""
        print_help
        exit 1
        ;;
esac



















